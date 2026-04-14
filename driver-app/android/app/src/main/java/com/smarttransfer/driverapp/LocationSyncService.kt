package com.smarttransfer.driverapp

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit
import okhttp3.*
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

class LocationSyncService : Service() {

    companion object {
        const val TAG = "NativeSyncSvc"
        const val CHANNEL_ID = "location_tracking"
        const val NOTIFICATION_ID = 1001
        const val API_BASE = "https://backend-production-69e7.up.railway.app/api"
        const val HTTP_INTERVAL_MS     = 1500L
        const val ACTION_START = "START_TRACKING"
        const val ACTION_STOP  = "STOP_TRACKING"
        const val EXTRA_TOKEN  = "auth_token"
        const val PREF_TOKEN   = "native_token"
        const val PREF_FILE    = "SmartTransferPrefs"
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }

    private lateinit var locationManager: LocationManager
    private lateinit var locationListener: LocationListener
    private val handler = Handler(Looper.getMainLooper())
    private var lastLocation: Location? = null
    private var authToken: String? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    // Offline storage queue for locations
    private val locationQueue = mutableListOf<JSONObject>()
    private val MAX_QUEUE_SIZE = 100

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val syncRunnable = object : Runnable {
        override fun run() {
            sendSync()
            handler.postDelayed(this, HTTP_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        createNotificationChannel()
        acquireLocks()
        Log.i(TAG, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand action=${intent?.action}")
        requestBatteryOptimizationExemption()

        if (intent?.action == ACTION_STOP) {
            stopTracking(); stopSelf(); return START_NOT_STICKY
        }

        val fromIntent = intent?.getStringExtra(EXTRA_TOKEN)
        if (!fromIntent.isNullOrBlank()) {
            authToken = fromIntent
            getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
                .edit().putString(PREF_TOKEN, fromIntent).apply()
            Log.i(TAG, "Token from intent OK len=${fromIntent.length}")
        } else {
            val stored = getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE).getString(PREF_TOKEN, null)
            authToken = stored
            Log.i(TAG, "Token from prefs: ${if (stored.isNullOrBlank()) "NULL" else "OK len="}")
        }

        if (authToken.isNullOrBlank()) {
            Log.e(TAG, "No auth token - stopping")
            stopSelf(); return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification("Canli konum takibi aktif"))
        startLocationUpdates()
        handler.postDelayed(syncRunnable, 1000L)
        Log.i(TAG, "Tracking started - HTTP every ${HTTP_INTERVAL_MS}ms")
        return START_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy")
        stopTracking()
        releaseLocks()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun requestBatteryOptimizationExemption() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = android.net.Uri.parse("package:$packageName")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(intent)
                Log.i(TAG, "Requested battery optimization exemption")
            } else {
                Log.i(TAG, "Already exempt from battery optimization")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Battery exemption request failed: ${e.message}")
        }
    }

    private fun acquireLocks() {
        try {
            wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SmartTransfer:WakeLock")
                .apply { setReferenceCounted(false); acquire(12 * 60 * 60 * 1000L) }
            wifiLock = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "SmartTransfer:WifiLock")
                .apply { acquire() }
            Log.i(TAG, "WakeLock+WifiLock acquired")
        } catch (e: Exception) { Log.w(TAG, "Lock error: ${e.message}") }
    }

    private fun releaseLocks() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        try { if (wifiLock?.isHeld == true) wifiLock?.release() } catch (_: Exception) {}
    }

    private fun startLocationUpdates() {
        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                lastLocation = location
                Log.i(TAG, "Location update: ${location.latitude},${location.longitude} spd=${location.speed}")
            }
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }

        try {
            val providers = mutableListOf<String>()
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                providers.add(LocationManager.GPS_PROVIDER)
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, locationListener, Looper.getMainLooper())
                Log.i(TAG, "GPS provider registered")
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                providers.add(LocationManager.NETWORK_PROVIDER)
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1000L, 0f, locationListener, Looper.getMainLooper())
                Log.i(TAG, "NETWORK provider registered")
            }

            // Seed with last known location immediately
            val cached = providers.mapNotNull { locationManager.getLastKnownLocation(it) }
                .maxByOrNull { it.time }
            if (cached != null) {
                lastLocation = cached
                Log.i(TAG, "Seeded from cache: ${cached.latitude},${cached.longitude} provider=${cached.provider}")
            }

            if (providers.isEmpty()) {
                Log.e(TAG, "No location providers available!")
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission denied: ${e.message}")
            stopSelf()
        }
    }

    private fun stopTracking() {
        handler.removeCallbacks(syncRunnable)
        try {
            if (::locationListener.isInitialized) locationManager.removeUpdates(locationListener)
        } catch (_: Exception) {}
    }

    private fun sendSync() {
        val token = authToken ?: run { Log.w(TAG, "sendSync: no token"); return }
        val loc = lastLocation

        val json = JSONObject()
        
        if (loc != null) {
            val spd = if (loc.hasSpeed() && loc.speed.isFinite()) loc.speed * 3.6 else 0.0
            val hdg = if (loc.hasBearing() && loc.bearing.isFinite()) loc.bearing.toDouble() else 0.0
            val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
                
            json.put("lat", loc.latitude)
            json.put("lng", loc.longitude)
            json.put("speed", spd)
            json.put("heading", hdg)
            json.put("timestamp", timestamp)
            
            val queueObj = JSONObject()
            queueObj.put("lat", loc.latitude)
            queueObj.put("lng", loc.longitude)
            queueObj.put("speed", spd)
            queueObj.put("heading", hdg)
            queueObj.put("timestamp", timestamp)
            
            synchronized(locationQueue) {
                if (locationQueue.size >= MAX_QUEUE_SIZE) {
                    locationQueue.removeAt(0)
                }
                locationQueue.add(queueObj)
            }
        }
        
        json.put("source", "native_foreground_service")
        json.put("checkNotifications", false)
        
        synchronized(locationQueue) {
            if (locationQueue.isNotEmpty()) {
                val queueArray = JSONArray()
                for (item in locationQueue) {
                    queueArray.put(item)
                }
                json.put("locationQueue", queueArray)
            }
        }

        val body = json.toString().toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$API_BASE/driver/sync")
            .post(body)
            .header("Authorization", "Bearer $token")
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Sync failed (Internet yok). Kuyruk boyutu: " + locationQueue.size)
            }
            override fun onResponse(call: Call, response: Response) {
                Log.i(TAG, "Sync OK code=${response.code} hasLoc=${loc != null}")
                if (response.code == 401) { 
                    authToken = null; stopSelf() 
                } else if (response.isSuccessful) {
                    synchronized(locationQueue) { locationQueue.clear() }
                }
                response.close()
            }
        })
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "Konum Takibi", NotificationManager.IMPORTANCE_LOW)
                .apply { setShowBadge(false); setSound(null, null) }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(text: String): Notification {
        val pi = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SmartTransfer Surucu")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true).setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW).build()
    }
}
