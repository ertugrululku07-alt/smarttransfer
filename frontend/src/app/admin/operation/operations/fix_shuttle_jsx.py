import os

file_path = r'd:\SmartTransfer\frontend\src\app\admin\operation\operations\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(len(lines)):
    # Fix editingStatus (already partly done, but let's be safe)
    if 'editingStatus.x' in lines[i]:
        lines[i] = lines[i].replace('editingStatus.x', 'editingStatus?.x')
    if 'editingStatus.y' in lines[i]:
        lines[i] = lines[i].replace('editingStatus.y', 'editingStatus?.y')
    
    # Fix editingCell
    if 'editingCell.value' in lines[i]:
        lines[i] = lines[i].replace('editingCell.value', 'editingCell?.value')
    
    # Fix editingDriverNote
    if 'editingDriverNote.value' in lines[i]:
        lines[i] = lines[i].replace('editingDriverNote.value', 'editingDriverNote?.value')

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
