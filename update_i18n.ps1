$content = Get-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Raw

# Add customFlow to English section
$oldEn = 'statusExtracting: "Reading file and extracting data...",
                statusSuccess: "Data extracted successfully! Ready to generate.",
                statusReady: "File ready as reference (No forms extracted).",
                statusError: "Cannot read file, please input manually."
            },
            ph:'

$newEn = 'statusExtracting: "Reading file and extracting data...",
                statusSuccess: "Data extracted successfully! Ready to generate.",
                statusReady: "File ready as reference (No forms extracted).",
                statusError: "Cannot read file, please input manually.",
                customFlow: {
                    modalTitle: "Build Custom Flow",
                    modalDesc: "Create your own Pre-Lesson and Flow step sequence. Each step needs a label (heading) and instruction (what happens in this step).",
                    preLessonLabel: "Pre-Lesson Steps",
                    flowLabel: "Flow Steps",
                    addPreLesson: "Add Step",
                    addFlow: "Add Step",
                    loadDefault: "Load Default Template",
                    cancel: "Cancel",
                    save: "Save Flow",
                    stepLabel: "Step Label",
                    stepLabelPlaceholder: "e.g., Review, Motivation, Discussion",
                    stepInstruction: "Instruction",
                    stepInstructionPlaceholder: "Describe what happens in this step...",
                    moveUp: "Move Up",
                    moveDown: "Move Down",
                    deleteStep: "Delete",
                    defaultPreLesson: [
                        { label: "Review", instruction: "Recall prior learning and connect to previous lessons." },
                        { label: "Motivation / Hook", instruction: "Spark interest with a question, image, scenario, or brief activity." },
                        { label: "Topic & Objectives", instruction: "Present the lesson topic and learning objectives clearly." }
                    ],
                    defaultFlow: [
                        { label: "Discussion of Concept #1", instruction: "Introduce and explain the first key concept with examples." },
                        { label: "Discussion of Concept #2", instruction: "Introduce and explain the second key concept with examples." },
                        { label: "Group Activities", instruction: "Facilitate differentiated group work with clear roles and tasks." },
                        { label: "Generalization", instruction: "Guide learners to synthesize and articulate the main ideas." },
                        { label: "Formative Assessment", instruction: "Check understanding with 5 targeted assessment items." },
                        { label: "Assignment", instruction: "Give practice work for reinforcement or preparation." }
                    ]
                },
            },
            ph:'

$content = $content -replace [regex]::Escape($oldEn), $newEn

# Add customFlow to Filipino section
$oldPh = 'statusExtracting: "Binabasa ang file at nag-e-extract ng data...",
                statusSuccess: "Data extracted successfully! Pwede mo nang i-generate.",
                statusReady: "File ready bilang reference (Walang na-extract na forms).",
                statusError: "Hindi mabasa ang file, paki-type na lamang nang manual."
            }
        };'

$newPh = 'statusExtracting: "Binabasa ang file at nag-e-extract ng data...",
                statusSuccess: "Data extracted successfully! Pwede mo nang i-generate.",
                statusReady: "File ready bilang reference (Walang na-extract na forms).",
                statusError: "Hindi mabasa ang file, paki-type na lamang nang manual.",
                customFlow: {
                    modalTitle: "Gumawa ng Custom na Daloy",
                    modalDesc: "Gumawa ng sariling Pre-Lesson at Flow step sequence. Kailangan ng bawat step ng label (heading) at instruction (anong nangyayari sa step na ito).",
                    preLessonLabel: "Mga Step sa Bago ang Aralin",
                    flowLabel: "Mga Step sa Daloy ng Aralin",
                    addPreLesson: "Magdagdag ng Step",
                    addFlow: "Magdagdag ng Step",
                    loadDefault: "I-load ang Default Template",
                    cancel: "Kanselahin",
                    save: "I-save ang Daloy",
                    stepLabel: "Label ng Step",
                    stepLabelPlaceholder: "hal. Balik-Aral, Pagganyak, Pagtalakay",
                    stepInstruction: "Instruksyon",
                    stepInstructionPlaceholder: "Ilarawan kung ano ang nangyayari sa step na ito...",
                    moveUp: "Ilipat Pataas",
                    moveDown: "Ilipat Pababa",
                    deleteStep: "Burahin",
                    defaultPreLesson: [
                        { label: "Balik-Aral", instruction: "Alalahanin ang dating natutunan at iugnay sa nakaraang aralin." },
                        { label: "Pagganyak / Hook", instruction: "Pukawin ang interes gamit ang tanong, larawan, sitwasyon, o maikling gawain." },
                        { label: "Paksa & Layunin", instruction: "Ipakilala nang malinaw ang paksa at mga layunin ng aralin." }
                    ],
                    defaultFlow: [
                        { label: "Pagtalakay ng Konsepto #1", instruction: "Ipakilala at ipaliwanag ang unang susing konsepto kasama ang halimbawa." },
                        { label: "Pagtalakay ng Konsepto #2", instruction: "Ipakilala at ipaliwanag ang ikalawang susing konsepto kasama ang halimbawa." },
                        { label: "Mga Gawain sa Pangkat", instruction: "Patnubayan ang differentiated group work na may malinaw na papel at gawain." },
                        { label: "Paglalahat", instruction: "Gabayan ang mga mag-aaral na buuin at ihayag ang mga pangunahing ideya." },
                        { label: "Formative na Pagtataya", instruction: "Suriin ang pag-unawa gamit ang 5 na target na assessment items." },
                        { label: "Takdang-Aralin", instruction: "Bigyan ng pagsasanay para sa pagpapatibay o paghahanda." }
                    ]
                }
            }
        };'

$content = $content -replace [regex]::Escape($oldPh), $newPh

Set-Content C:\Users\Administrator\Desktop\SilidPinoy_Studio\lesson.html -Value $content -NoNewline
Write-Host "Done"