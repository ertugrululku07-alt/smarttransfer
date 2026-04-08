import sys
import os

file_path = r'd:\SmartTransfer\frontend\src\app\admin\operation\operations\page.tsx'
footer_path = r'd:\SmartTransfer\frontend\src\app\admin\operation\operations\shuttle_footer_fixed.txt'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(footer_path, 'r', encoding='utf-8') as f:
    footer_jsx = f.read()

# find end of shuttleRuns.map loop
start_index = -1
for i, line in enumerate(lines):
    if 'return (' in line and '<DroppableShuttleRun' in lines[i+1] and i > 2000:
         # Need to find the closing ); of the map
         pass

# Easier approach: find where 2281 was (end of map loop)
# In current file:
# 2280:                                         );
# 2281:                                     })}
for i, line in enumerate(lines):
    if '})}' in line and i > 2200:
        start_index = i + 1
        break

if start_index == -1:
    print("Could not find loop end")
    sys.exit(1)

# Find AdminLayout end
end_index = -1
for i, line in enumerate(lines):
    if '</AdminLayout>' in line:
        end_index = i
        break

if end_index == -1:
    print("Could not find layout end")
    sys.exit(1)

# Stitching
new_lines = lines[:start_index] + [footer_jsx] + lines[end_index:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Footer restored successfully")
