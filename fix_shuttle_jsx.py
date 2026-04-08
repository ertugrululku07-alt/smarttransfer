import os

filepath = r"d:\SmartTransfer\frontend\src\app\admin\operation\operations\page.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Garbage starts after </div> on line 2360 (which is index 2359)
# And ends before </DroppableShuttleRun> on line 2390 (index 2389)
# BUT indices might have shifted.

# Let's find the markers.
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    # The unique garbage line
    if 'style={{ cursor: \'grab\', color: \'#9ca3af\', fontSize: 13, lineHeight: 1, userSelect: \'none\' }}' in line:
        # Check if it is the one surrounded by corrupted code.
        if 'title="Sürükleyerek taşı"' in lines[i+1]:
             start_idx = i
             break

if start_idx != -1:
    # Find the end of the garbage block: </table> or </div> after it.
    for i in range(start_idx, len(lines)):
        if '</table>' in lines[i]:
             # The block usually ends with </div> after </table>
             end_idx = i + 2 # include up to the div that ends the card body
             break

if start_idx != -1 and end_idx != -1:
    # We want to keep the closing tags for the map and the component.
    # The garbage starts at line start_idx - 1 (the </div> before it) or so?
    # Let's be more precise.
    
    # Looking at view_file:
    # 2360: </div> (Correct, ends the grid)
    # 2361: garbage
    # ...
    # 2387: </table>
    # 2388: </div>
    # 2389: </div>
    # 2390: </DroppableShuttleRun>
    
    # We should keep 2360 and 2390 onwards.
    # Indices: 2359 (line 2360) and 2389 (line 2390).
    
    new_lines = lines[:2360] + lines[2389:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Removed garbage from index 2360 to 2388. Reduced from {len(lines)} to {len(new_lines)} lines.")
else:
    print(f"Could not find exact garbage markers. start: {start_idx}, end: {end_idx}")
