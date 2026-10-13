$content = Get-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Raw

# Fix English sequenceInstructionEn - add custom between collab and demo
$searchEn = @'
: lessonSequence === 'collab'
                    ? `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Collaborative Learning Sequence.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings: <b>Review:</b>, <b>Motivation:</b>, and <b>Group Task Orientation:</b>.
In the "Lesson Flow" row, use ONLY these headings: <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, and <b>Individual Accountability:</b>.
Make each learner role clear so group work will not become one student doing all the work."
                    : lessonSequence === 'demo'
                    ? `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Demonstration–Return Demonstration Flow.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings: <b>Review:</b>, <b>Motivation:</b>, and <b>Safety/Procedure Reminder:</b>.
In the "Lesson Flow" row, use ONLY these headings: <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, and <b>Application/Performance Task:</b>.
This is best for EPP/TLE, MAPEH, Science skills, and performance-based lessons."
                    : `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Review–Motivation–Discussion Sequence.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings and this order: <b>Review:</b> and <b>Motivation:</b>.
In the "Lesson Flow" row, use ONLY these headings and this order: <b>Discussion:</b>, <b>Independent Activity:</b>, <b>Group Activity (Differentiated Group Activity):</b>, <b>Generalization:</b>, <b>Application:</b>, and <b>Valuing:</b>.
Do not use 5E headings inside Pre-Lesson/Flow when this option is selected.";
'@

$replaceEn = @'
: lessonSequence === 'collab'
                    ? `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Collaborative Learning Sequence.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings: <b>Review:</b>, <b>Motivation:</b>, and <b>Group Task Orientation:</b>.
In the "Lesson Flow" row, use ONLY these headings: <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, and <b>Individual Accountability:</b>.
Make each learner role clear so group work will not become one student doing all the work."
                    : lessonSequence === 'custom'
                    ? (() => {
                        const flow = loadCustomFlow() || getDefaultCustomFlow();
                        const preLessonHeadings = flow.preLesson.map((s, i) => "<b>" + (i+1) + ". " + s.label + ":</b>").join(", ");
                        const flowHeadings = flow.flow.map((s, i) => "<b>" + (i+1) + ". " + s.label + ":</b>").join(", ");
                        return `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Custom Flow.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings: " + preLessonHeadings + ".
In the "Lesson Flow" row, use ONLY these headings: " + flowHeadings + ".
Follow the instructions for each step as defined in the custom flow builder.`;
                    })()
                    : lessonSequence === 'demo'
                    ? `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Demonstration–Return Demonstration Flow.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings: <b>Review:</b>, <b>Motivation:</b>, and <b>Safety/Procedure Reminder:</b>.
In the "Lesson Flow" row, use ONLY these headings: <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, and <b>Application/Performance Task:</b>.
This is best for EPP/TLE, MAPEH, Science skills, and performance-based lessons."
                    : `
USER-SELECTED SEQUENCE FOR PRE-LESSON AND FLOW: Review–Motivation–Discussion Sequence.
CRITICAL: In the "Before the Lesson" row, use ONLY these headings and this order: <b>Review:</b> and <b>Motivation:</b>.
In the "Lesson Flow" row, use ONLY these headings and this order: <b>Discussion:</b>, <b>Independent Activity:</b>, <b>Group Activity (Differentiated Group Activity):</b>, <b>Generalization:</b>, <b>Application:</b>, and <b>Valuing:</b>.
Do not use 5E headings inside Pre-Lesson/Flow when this option is selected.";
'@

$content = $content.Replace($searchEn, $replaceEn)

# Fix Filipino sequenceInstructionPh - add custom between collab and demo
$searchPh = @'
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

$replacePh = @'
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

$content = $content.Replace($searchPh, $replacePh)

Set-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Value $content -NoNewline
Write-Host "Done fixing sequence instructions"