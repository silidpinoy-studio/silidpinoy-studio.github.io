$content = Get-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Raw

# Find the Filipino collab case and add custom case after it
$search = ': lessonSequence === "collab"
                    ? `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Collaborative Learning Sequence.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Group Task Orientation:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, at <b>Individual Accountability:</b>.
Ilagay ang malinaw na papel ng bawat mag-aaral upang hindi maging group work na isang bata lang ang nagtatrabaho."
                    : `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Demonstration–Return Demonstration Flow.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Safety/Procedure Reminder:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, at <b>Application/Performance Task:</b>.
Mainam ito para sa EPP/TLE, MAPEH, Science skills, at performance-based lessons.";'

$replace = ': lessonSequence === "collab"
                    ? `
NAPILING DALUYAN NG USER PARA SA BAGO ANG ARALIN AT DALOY NG ARALIN: Collaborative Learning Sequence.
MAHALAGA: Sa row na "Bago ang Aralin", gamitin LAMANG ang headings na <b>Review:</b>, <b>Motivation:</b>, at <b>Group Task Orientation:</b>.
Sa row na "Daloy ng Aralin", gamitin LAMANG ang headings na <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, at <b>Individual Accountability:</b>.
Ilagay ang malinaw na papel ng bawat mag-aaral upang hindi maging group work na isang bata lang ang nagtatrabaho."
                    : lessonSequence === "custom"
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
Mainam ito para sa EPP/TLE, MAPEH, Science skills, at performance-based lessons.";'

$content = $content.Replace($search, $replace)

Set-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Value $content -NoNewline
Write-Host "Done Filipino sequence"