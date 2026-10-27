s = open(r'C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html', encoding='utf-8').read()
found = 'value="custom"' in s
print('Custom preset in COI dropdown:', 'YES — present' if found else 'NO — missing')
if found:
    idx = s.find('value="custom"')
    context = s[idx-30:idx+40].replace('\n', ' ')
    print('Location snippet:', context[:80])
