/** @type {import('@expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const extra = { ...config.extra };
  if (process.env.EXPO_PUBLIC_API_URL) extra.apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (process.env.EXPO_PUBLIC_SOCKET_URL) extra.socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (process.env.EXPO_PUBLIC_TENANT_SLUG) extra.tenantSlug = process.env.EXPO_PUBLIC_TENANT_SLUG;
  return { ...config, extra };
};
