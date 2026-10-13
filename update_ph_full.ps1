$content = Get-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Raw

# Use here-strings to avoid quote escaping issues
$search1 = @'
: lessonSequence === 'collab'
                    ? `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Collaborative Learning Sequence.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Group Task Orientation:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, at <b>Individual Accountability:</b>.
Ilagay ang malinaw na papel ng bawat mag-aaral upang hindi maging group work na isang bata lang ang nagtatrabaho."
                    : `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Demonstration–Return Demonstration Flow.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Safety/Procedure Reminder:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, at <b>Application/Performance Task:</b>.
Mainam ito para sa EPP/TLE, MAPEH, Science skills, at performance-based lessons.";
'@

$replace1 = @'
: lessonSequence === 'collab'
                    ? `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Collaborative Learning Sequence.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Group Task Orientation:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, at <b>Individual Accountability:</b>.
Ilagay ang malinaw na papel ng bawat mag-aaral upang hindi maging group work na isang bata lang ang nagtatrabaho."
                    : lessonSequence === 'custom'
                    ? (() => {
                        const flow = loadCustomFlow() || getDefaultCustomFlow();
                        const preLessonHeadings = flow.preLesson.map((s, i) => "<b>" + (i+1) + ". " + s.label + ":</b>").join(", ");
                        const flowHeadings = flow.flow.map((s, i) => "<b>" + (i+1) + ". " + s.label + ":</b>").join(", ");
                        return `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Custom Flow.
MAHALAGA: Gamitin ang eksaktong headings na ito at huwag palitan ang pagkakasunod-sunod.
Sa row na "Bago ang Aralin", gamitin ang: " + preLessonHeadings + ".
Sa row na "Daloy ng Aralin", gamitin ang: " + flowHeadings + ".
Sundin ang instruksyon para sa bawat step na nakalagay sa custom flow builder.`;
                    })()
                    : `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Demonstration–Return Demonstration Flow.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Safety/Procedure Reminder:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, at <b>Application/Performance Task:</b>.
Mainam ito para sa EPP/TLE, MAPEH, Science skills, at performance-based lessons.";
'@

$content = $content.Replace($search1, $replace1)

# 2. Add custom case to Filipino preLessonColsPh
$search2 = @'
if (lessonSequence === 'collab') return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Group Task Orientation:</b>. Ihanda ang learners sa collaborative task at malinaw na roles.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Safety/Procedure Reminder:</b>. Ipaalala ang tamang paraan at pag-iingat bago ang demonstration.)</td>`;
                    return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang eksaktong headings na <b>1. Paunang Gawain:</b>, <b>2. Balik-Aral:</b>, at <b>3. Pagganyak:</b>.)</td>`;
'@

$replace2 = @'
if (lessonSequence === 'collab') return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Group Task Orientation:</b>. Ihanda ang learners sa collaborative task at malinaw na roles.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Safety/Procedure Reminder:</b>. Ipaalala ang tamang paraan at pag-iingat bago ang demonstration.)</td>`;
                    if (lessonSequence === 'custom') {
                        const flow = loadCustomFlow() || getDefaultCustomFlow();
                        const headings = flow.preLesson.map((s, idx) => "<b>" + (idx+1) + ". " + s.label + ":</b> " + s.instruction).join("; ");
                        return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang headings: " + headings + ".)</td>`;
                    }
                    return `<td>(Bago ang Aralin para sa Sesyon ${i+1}. Gamitin ang eksaktong headings na <b>1. Paunang Gawain:</b>, <b>2. Balik-Aral:</b>, at <b>3. Pagganyak:</b>.)</td>`;
'@

$content = $content.Replace($search2, $replace2)

# 3. Add custom case to Filipino flowColsPh
$search3 = @'
if (lessonSequence === 'collab') return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, at <b>Individual Accountability:</b>. Gawing malinaw ang roles, output, at rubrics/simple criteria.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, at <b>Application/Performance Task:</b>. Ilahad ang step-by-step procedure at performance criteria.)</td>`;
                    return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang eksaktong headings na <b>4. Paglalahad ng Aralin:</b>, <b>5. Pagtalakay:</b>, <b>6. Pinatnubayang Pagsasanay:</b>, <b>7. Malayang Pagsasanay:</b>, <b>8. Paglalahat:</b>, <b>9. Paglalapat:</b>, <b>10. Pagtataya:</b>, at <b>11. Takdang-Aralin:</b>.)</td>`;
'@

$replace3 = @'
if (lessonSequence === 'collab') return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, at <b>Individual Accountability:</b>. Gawing malinaw ang roles, output, at rubrics/simple criteria.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang headings na <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, at <b>Application/Performance Task:</b>. Ilahad ang step-by-step procedure at performance criteria.)</td>`;
                    if (lessonSequence === 'custom') {
                        const flow = loadCustomFlow() || getDefaultCustomFlow();
                        const headings = flow.flow.map((s, idx) => "<b>" + (idx+1) + ". " + s.label + ":</b> " + s.instruction).join("; ");
                        return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang headings: " + headings + ".)</td>`;
                    }
                    return `<td>(Daloy ng Aralin para sa Sesyon ${i+1}. Gamitin ang eksaktong headings na <b>4. Paglalahad ng Aralin:</b>, <b>5. Pagtalakay:</b>, <b>6. Pinatnubayang Pagsasanay:</b>, <b>7. Malayang Pagsasanay:</b>, <b>8. Paglalahat:</b>, <b>9. Paglalapat:</b>, <b>10. Pagtataya:</b>, at <b>11. Takdang-Aralin:</b>.)</td>`;
'@

$content = $content.Replace($search3, $replace3)

Set-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Value $content -NoNewline
Write-Host "Done Filipino sequence and table vars"