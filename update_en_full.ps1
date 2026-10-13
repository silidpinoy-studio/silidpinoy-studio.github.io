$content = Get-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Raw

# Add custom case to English sequenceInstructionEn
$search1 = @'
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

$replace1 = @'
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

$content = $content.Replace($search1, $replace1)

# Add custom case to English preLessonColsEn
$search2 = @'
if (lessonSequence === 'collab') return `<td>(Before the Lesson for Session ${i+1}. Use the headings <b>Review:</b>, <b>Motivation:</b>, and <b>Group Task Orientation:</b>. Prepare learners for the collaborative task and roles.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Before the Lesson for Session ${i+1}. Use the headings <b>Review:</b>, <b>Motivation:</b>, and <b>Safety/Procedure Reminder:</b>. Remind learners of proper steps and safety before demonstration.)</td>`;
                    return `<td>(Before the Lesson for Session ${i+1}. Use only the headings <b>Review:</b> and <b>Motivation:</b>. Review recalls prior learning; Motivation sparks interest connected to the lesson.)</td>`;
'@

$replace2 = @'
if (lessonSequence === 'collab') return `<td>(Before the Lesson for Session ${i+1}. Use the headings <b>Review:</b>, <b>Motivation:</b>, and <b>Group Task Orientation:</b>. Prepare learners for the collaborative task and roles.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Before the Lesson for Session ${i+1}. Use the headings <b>Review:</b>, <b>Motivation:</b>, and <b>Safety/Procedure Reminder:</b>. Remind learners of proper steps and safety before demonstration.)</td>`;
                    if (lessonSequence === 'custom') {
                        const flow = loadCustomFlow() || getDefaultCustomFlow();
                        const headings = flow.preLesson.map((s, idx) => "<b>" + (idx+1) + ". " + s.label + ":</b> " + s.instruction).join("; ");
                        return `<td>(Before the Lesson for Session ${i+1}. Use the headings: " + headings + ".)</td>`;
                    }
                    return `<td>(Before the Lesson for Session ${i+1}. Use only the headings <b>Review:</b> and <b>Motivation:</b>. Review recalls prior learning; Motivation sparks interest connected to the lesson.)</td>`;
'@

$content = $content.Replace($search2, $replace2)

# Add custom case to English flowColsEn
$search3 = @'
if (lessonSequence === 'collab') return `<td>(Lesson Flow for Session ${i+1}. Use the headings <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, and <b>Individual Accountability:</b>. Make roles, output, and criteria clear.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Lesson Flow for Session ${i+1}. Use the headings <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, and <b>Application/Performance Task:</b>. Include step-by-step procedure and performance criteria.)</td>`;
                    return `<td>(Lesson Flow for Session ${i+1}. Use only the headings <b>Discussion:</b>, <b>Independent Activity:</b>, <b>Group Activity (Differentiated Group Activity):</b>, <b>Generalization:</b>, <b>Application:</b>, and <b>Valuing:</b>. Make it detailed, sequential, and suitable to the learner level.)</td>`;
'@

$replace3 = @'
if (lessonSequence === 'collab') return `<td>(Lesson Flow for Session ${i+1}. Use the headings <b>Think-Pair-Share:</b>, <b>Group Activity:</b>, <b>Gallery Walk/Reporting:</b>, <b>Peer Feedback:</b>, <b>Synthesis:</b>, and <b>Individual Accountability:</b>. Make roles, output, and criteria clear.)</td>`;
                    if (lessonSequence === 'demo') return `<td>(Lesson Flow for Session ${i+1}. Use the headings <b>Teacher Demonstration:</b>, <b>Guided Demonstration:</b>, <b>Return Demonstration:</b>, <b>Feedback and Correction:</b>, and <b>Application/Performance Task:</b>. Include step-by-step procedure and performance criteria.)</td>`;
                    if (lessonSequence === 'custom') {
                        const flow = loadCustomFlow() || getDefaultCustomFlow();
                        const headings = flow.flow.map((s, idx) => "<b>" + (idx+1) + ". " + s.label + ":</b> " + s.instruction).join("; ");
                        return `<td>(Lesson Flow for Session ${i+1}. Use the headings: " + headings + ".)</td>`;
                    }
                    return `<td>(Lesson Flow for Session ${i+1}. Use only the headings <b>Discussion:</b>, <b>Independent Activity:</b>, <b>Group Activity (Differentiated Group Activity):</b>, <b>Generalization:</b>, <b>Application:</b>, and <b>Valuing:</b>. Make it detailed, sequential, and suitable to the learner level.)</td>`;
'@

$content = $content.Replace($search3, $replace3)

Set-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Value $content -NoNewline
Write-Host "Done English sequence and table vars"