const OpenAI = require('openai');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');
// const { ensureDirSync, OUTPUTS_DIR } = require('../config/storage');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Baseline skills pool — for reference only. Use required skills from JD first, then add from these pools as needed.
const BASELINE_SKILLS = {
    programmingLanguages: [
        'JavaScript', 'TypeScript', 'Node.js', 'Python', 'Java', 'Go', 'C', 'C++', 'PHP', 'SQL', 'Ruby', 'C#'
    ],
    frontend: [
        'React.js', 'Next.js', 'React Router', 'Redux', 'Redux Toolkit', 'TypeScript', 'Tailwind CSS', 'HTML5', 'CSS3', 'SASS/LESS',
        'Material UI', 'Chakra UI', 'Ant Design', 'Vue.js', 'Angular'
    ],
    backend: [
        'Node.js', 'Express.js', 'Nest.js', 'RESTful APIs', 'GraphQL', 'JWT', 'OAuth 2.0', 'WebSockets', 'Python', 'FastAPI',
        'Django', 'Flask', 'Java', 'Spring Boot', 'Ruby', 'Ruby On Rails', 'ASP.NET', 'Laravel'
    ],
    database: [
        'PostgreSQL', 'MongoDB', 'MySQL', 'SQL', 'Redis', 'Prisma', 'TypeORM', 'DynamoDB', 'Elasticsearch', 'SQLite',
        'Database Design', 'Query Optimization', 'BigQuery', 'Snowflake'
    ],
    dataEtl: [
        'Databricks', 'Apache Spark', 'PySpark', 'Delta Lake', 'Airflow', 'dbt', 'ETL/ELT Pipelines', 'Data Modeling',
        'Data Warehousing', 'Data Quality', 'Data Validation', 'Data Governance', 'Data Lineage', 'Data Catalog', 'Kafka'
    ],
    cloudDevops: [
        'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'GitHub Actions', 'Terraform', 'Linux', 'Azure', 'GCP', 'Monitoring & Alerting',
        'Nginx', 'Vercel', 'Netlify'
    ],
    aiLlmMl: [
        'OpenAI API', 'GPT-4', 'Prompt Engineering', 'Embeddings', 'Vector Search', 'Semantic Search', 'LangChain', 'Hugging Face', 'RAG', 'NLP',
        'spaCy', 'Milvus', 'Pinecone', 'Weaviate'
    ],
    methodologiesTools: [
        'Agile', 'Scrum', 'Kanban', 'Git', 'Jira', 'Code Review', 'Unit Testing', 'Integration Testing', 'System Design', 'API Design',
        'Postman', 'Swagger/OpenAPI'
    ],
};

function containsPercentageLike(text) {
    const t = String(text || '');
    // Catch common forms:
    // - "15%"
    // - "15 percent" / "15 percentage"
    // - "15 percentages"
    // - "per cent" (rare but occurs)
    return /%|\bper\s*cent\b|\bpercent(age)?s?\b/i.test(t);
}

function mustNotIncludePercentagesInSummary(summary) {
    // Strict requirement from user: no percentages in Summary.
    // We treat both "%" and words like "percent"/"percentage" as violations.
    return !containsPercentageLike(summary);
}

// Remove version numbers after technology names (e.g. "PHP 8" → "PHP", "Zend Framework 1" → "Zend Framework")
function stripTechVersions(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\b(Zend Framework|Node\.js|Express\.js|Next\.js|React\.js|Tailwind CSS|PHP|React|Angular|Vue|Python|Java|TypeScript|Laravel|Django|Rails|Redis|MySQL|PostgreSQL|MongoDB|jQuery|Bootstrap|Kubernetes|Docker|Terraform|GraphQL|Redux|Webpack|Jest|Cypress)\s+\d+(\.\d+)*\b/gi, '$1');
}

function stripVersionNumbersFromResume(resumeData) {
    if (resumeData.summary) {
        resumeData.summary = stripTechVersions(resumeData.summary);
    }
    if (Array.isArray(resumeData.skills)) {
        resumeData.skills = resumeData.skills.map(stripTechVersions);
    }
    JOB_FIELD_NAMES.forEach((field) => {
        const bulletsKey = `${field}Bullets`;
        if (Array.isArray(resumeData[bulletsKey])) {
            resumeData[bulletsKey] = resumeData[bulletsKey].map(stripTechVersions);
        }
    });
}

// Default company info (can be overridden)
// Companies array is ordered from most recent to oldest
const DEFAULT_COMPANY_INFO = {
    name: 'Gilbert Tursio',
    companies: [
        { name: 'Creative Wave', period: '01/2022 - Present' },
        { name: 'PixelPeak', period: '06/2019 - 12/2021' },
        { name: 'Brightmind', period: '03/2017 - 05/2019' },
        { name: 'Sparks', period: '08/2015 - 02/2017' }
    ]
};

// Job title field names (standardized: firstJob is always most recent)
const JOB_FIELD_NAMES = ['firstJob', 'secondJob', 'thirdJob', 'fourthJob', 'fifthJob'];

// Bullet count constraints per position
const EXPERIENCE_BULLET_CONSTRAINTS = {
    'firstJob': { min: 5, max: 6 },   // 5-6 bullets, max 6
    'secondJob': { min: 5, max: 6 },   // 5-6 bullets, max 6
    'thirdJob': { min: 5, max: 5 },    // 5 bullets, max 5
    'fourthJob': { min: 5, max: 5 },   // 5 bullets, max 5
    'fifthJob': { min: 5, max: 5 }     // 5 bullets, max 5
};

// Seniority levels per bullet field based on company count
const EXPERIENCE_SENIORITY_LEVELS = {
    'firstJob': {
        2: 'Senior',
        3: 'Senior',
        4: 'Senior',
        5: 'Senior'
    },
    'secondJob': {
        2: 'Entry-level',
        3: 'Senior',
        4: 'Senior',
        5: 'Senior'
    },
    'thirdJob': {
        3: 'Entry-level',
        4: 'Entry-level',
        5: 'Entry-level'
    },
    'fourthJob': {
        4: 'Entry-level',
        5: 'Entry-level'
    },
    'fifthJob': {
        5: 'Entry-level'
    }
};

// Seniority descriptions for prompts
const SENIORITY_DESCRIPTIONS = {
    'Senior': 'Show leading features end-to-end, owning services, raising quality via testing/observability, collaborating with product/security/infra.',
    'Entry-level': 'Show growth, implementing scoped features, fixing bugs, writing tests, following code reviews, delivering under guidance (avoid senior-level ownership claims).'
};

// Helper function to get Zod schema for experience field
function getExperienceFieldSchema(fieldName) {
    const constraint = EXPERIENCE_BULLET_CONSTRAINTS[fieldName];
    if (!constraint) {
        throw new Error(`Unknown experience field: ${fieldName}`);
    }
    if (constraint.min === constraint.max) {
        return z.array(z.string()).length(constraint.min);
    }
    return z.array(z.string()).min(constraint.min).max(constraint.max);
}

// Helper function to format bullet count text for prompts
function getBulletCountText(fieldName) {
    const constraint = EXPERIENCE_BULLET_CONSTRAINTS[fieldName];
    if (constraint.min === constraint.max) {
        return `${constraint.min}`;
    }
    return `${constraint.min}–${constraint.max}`;
}

// Helper function to get seniority level for an experience field based on company count
function getSeniorityLevel(fieldName, numCompanies) {
    return EXPERIENCE_SENIORITY_LEVELS[fieldName][numCompanies];
}

/**
 * Calls OpenAI to generate the initial resume content (skills, experience bullets, summary, job titles).
 * Returns parsed resume data with *Title keys copied to short names (firstJob, secondJob, etc.).
 */
async function runResumeCompletion(jobDescription, candidateInfo, numCompanies, generatedResumeExtracted) {
    // Build experience prompts - one shared prompt template for all positions
    const experiencePrompts = [];
    const positionLabels = ['first', 'second', 'third', 'fourth', 'fifth'];

    for (let i = 0; i < numCompanies && candidateInfo.companies[i]; i++) {
        const fieldName = JOB_FIELD_NAMES[i];
        const seniority = getSeniorityLevel(fieldName, numCompanies);
        const seniorityDesc = SENIORITY_DESCRIPTIONS[seniority];
        const label = positionLabels[i];
        const period = candidateInfo.companies[i].period;
        const bulletCountText = getBulletCountText(fieldName);
        const maxBullets = EXPERIENCE_BULLET_CONSTRAINTS[fieldName].max;
        const alignWithJd = i === 0
            ? 'Relevant to JD domain/tech but write DISTINCT projects—do not paraphrase or mirror JD responsibilities; describe different problem spaces and deliverables that happen to use JD-relevant skills.'
            : 'Use JD-relevant tech where appropriate; technologies historically accurate for this period. Do not copy JD wording.';

        experiencePrompts.push({
            role: "user",
            content: `Experience — ${label} position (${period}): Write ${bulletCountText} bullet points (max ${maxBullets}). Seniority: ${seniority}. ${seniorityDesc} ${alignWithJd} Include at least one bullet that reflects a soft skill or experience mentioned in the JD (e.g. collaboration, mentoring, cross-functional work). Include measurable results/achievements in bullets where appropriate (e.g. performance improvements, scale metrics, efficiency gains). Output field: ${fieldName}Bullets`
        });
    }

    const profileLines = [
        `Name: ${candidateInfo.name}`,
        ...candidateInfo.companies.map((c, i) => {
            const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
            return `${labels[i]} Company: ${c.name} (${c.period})`;
        })
    ].join('\n');

    console.log('Profile:', profileLines);

    const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
            {
                role: "system",
                content: `You are a professional resume writer for software/tech roles. Generate a resume tailored to the job description. Follow the user steps in order; output must be publication-ready in one pass.

                        ============================================
                        CONTEXT
                        ============================================

                        --- PROFILE ---
                        ${profileLines}

                        --- JOB DESCRIPTION ---
                        ${jobDescription}

                        ============================================
                        CORE RULES
                        ============================================

                        SECTION 1: EXPERIENCE BULLETS

                        Content Requirements:
                        • Real project experience only; no generic responsibilities. Projects plausible for that company context (use profile company names as context only—do not mention company names in bullet text).
                        • Bullets 1–2: name the project by purpose (e.g. "multi-tenant billing platform", "customer dashboard"), what it was for, what you built/shipped. No project codenames (e.g. Atlas, Helios).
                        • Do NOT mirror or paraphrase the JD. Write different, plausible projects (different products/domains/problem spaces) that naturally use some JD tech and skills. Same field or tech stack is enough; never copy JD responsibility list or wording.
                        • Per position: mention at least 7–10 distinct skills/technologies across all bullets for that position. Spread them across bullets; do not cram many unrelated skills into one bullet.
                        • Within each bullet, mention only skills that fit that project. Use a coherent stack per bullet—e.g. one backend bullet might use **Node.js**, **Express**, **PostgreSQL**; do not mix unrelated stacks in one bullet (e.g. avoid **Python** and **Node.js** in the same bullet; pick one backend language/framework that fits the project).
                        • First/second position: weave in key JD skills and technologies across bullets, plus extra relevant skills (frameworks, infra, testing, observability). Each bullet = concrete project work (what was built, for whom, outcome)—not a rephrased JD requirement.
                        • Senior positions: include leadership (mentoring, technical direction, cross-team alignment, ownership of scope).
                        • Per position: include at least one bullet that demonstrates a soft skill or behavioral trait mentioned in the JD (e.g. collaboration, communication, mentoring, ownership, cross-functional work)—weave it into concrete project context, not as a standalone claim.
                        • Measurable Results: Each position must have 1–2 bullets with specific achievements or impact metrics. CRITICAL—do not concentrate metrics in the most recent role: the most recent position (current job) must have at most 1 bullet with measurable results; older positions (second, third, fourth, fifth job) must each have at least 1 and at most 2. Put more measurable results in older roles, not in the latest. Use concrete numbers (response times, throughput, scale, efficiency gains, cost savings, error reduction, test coverage, etc.); prefer absolute units over percentages (e.g. "reduced from 500ms to 50ms" not "by 90%"). Keep metrics realistic and contextually appropriate for the project and time period.

                        Formatting Requirements:
                        • No company names in bullets; write generically ("Led development of..." not "at CompanyX"). No "Tech stack:" or "How:" labels—weave tech into prose.
                        • EVERY technology and skill name in experience MUST be bolded: wrap each in ** (e.g. **Node.js**, **React**, **PostgreSQL**). No tech in plain text.
                        • Technologies historically accurate per period (e.g. React Hooks 2019, TypeScript 2018–2019, Docker 2014–2015, Kubernetes 2017–2018, ChatGPT/LLMs 2023).

                        SECTION 2: JOB TITLES

                        • Seniority: only "Senior" prefix or none. No Junior/Mid/Associate. Senior → "Senior X"; Entry → "X" only.
                        • Match JD title type (Developer/Engineer); prefer "Developer" if unclear. Map: Rust/Python/Java/C#/Ruby/Go/PHP → Backend; React/Vue/JS/Angular → Frontend; AI/LLM/NLP/GenAI → AI; Data/ETL/Spark/Airflow → Data Engineer; ML/MLOps → ML; DevOps/SRE/K8s/CI-CD → DevOps; unknown → Software Engineer.
                        • Never include language/framework names in job title. JD "Senior Full Stack PHP Developer" → output "Senior Full Stack Developer". Use only role type (Full Stack Developer, Backend Developer, etc.) + seniority prefix if applicable.

                        SECTION 3: LANGUAGE & STYLE

                        • US professional English. No citizenship/visa/nationality. Summary: bold key tech; no percentages.
                        • No AI-isms (spearheaded, leveraged, robust, utilized).
                        • No version numbers with technologies: write "PHP", "React", "Node.js" not "PHP 8", "React 18", "Node.js 20". Use technology names only.

                        SECTION 4: ATS (APPLICANT TRACKING SYSTEM)

                        • Weave JD keywords naturally into summary and experience bullets so ATS can match requirements; do not stuff unnaturally.
                        • Use standard job titles and skill names (no nicknames or obscure terms); prefer full names where widely recognized (e.g. "JavaScript", "TypeScript").
                        • Use standard, parseable action verbs: developed, implemented, led, designed, built, delivered, improved, integrated, optimized (avoid vague or flowery language).
                        • Keep generated text parseable: standard punctuation (hyphens, commas); no exotic Unicode or symbols in the resume content.

                        SECTION 5: SKILLS (DYNAMIC CATEGORIES)

                        Categories (from JD + role; not a fixed list):
                        • Include categories that cover all required skill areas in the JD (a required area may have one or more categories). Add others as relevant (e.g. Methodologies & Tools, Testing, Security, Data & ETL, AI/ML). Total: 5–9 categories.
                        • Use clear, standard labels: "Programming Languages", "Frontend", "Backend", "Database", "Cloud & DevOps", "AI/LLM/ML", "Methodologies & Tools", or "Security", "Testing", "Data & ETL" when the JD emphasizes them.

                        Format and counts:
                        • One string per category: "<Category Label>: skill1, skill2, ...". Aim for 10–15 items per category (exception below); list JD-required skills first, then fill from the baseline pool.
                        • Programming Languages (exception): first list languages required in the job description; then add JavaScript, Node.js, Python, and SQL at the end. Total: 6–9 items.
                        • Dedupe; no soft skills; plain text only (no markdown). Use exact or standard spellings from the JD and industry terms for ATS.`
            },
            {
                role: "user",
                content:
                    `============================================
                    STEP 1 — SKILLS (DYNAMIC CATEGORIES)
                    ============================================

                    Build the skills array per SECTION 5.
                    Format: one string per category — "<Category>: skill1, skill2, ..."
                    Use the baseline pool below to fill categories.

                    Baseline pool (reference): ${JSON.stringify(BASELINE_SKILLS, null, 2)}`
            },
            ...experiencePrompts,
            {
                role: "user",
                content:
                    `============================================
                    STEP 2 — SUMMARY
                    ============================================

                    Write 4–5 sentences summarizing the candidate's experience.

                    Requirements:
                    • Do NOT use or mention the profile name (e.g. avoid "Lavell Thompson is a..." or "[Name] has...").
                    • Write in third person without naming the person (e.g. "Senior Software Engineer with...", "Experienced in...").
                    • Do not mention specific projects; focus on experience summary only.
                    • Include key JD keywords and tech stack in bold (**) for ATS matching; use standard role and technology terminology.
                    • No percentages. Keep wording parseable and keyword-rich for ATS.`
            },
            {
                role: "user",
                content:
                    `============================================
                    STEP 3 — CHECK AND FINALIZE
                    ============================================

                    Before outputting, CHECK your generated content against these requirements and FIX any violations:

                    CHECKLIST:

                    1) Job Titles
                       • Present for each position
                       • Seniority only "Senior" or none
                       • No language/framework in title (e.g. "Senior Full Stack Developer" not "Senior PHP Developer")
                       • JD title type (Developer/Engineer) respected

                    2) Bullet Counts
                       • firstJob/secondJob = 5–6 bullets each
                       • thirdJob/fourthJob/fifthJob = exactly 5 bullets each
                       • Add or trim bullets to match

                    3) Experience Bullets Content
                       • No company names (e.g. no "Creative Wave", "PixelPeak")
                       • No project codenames (e.g. no "Atlas", "Helios")
                       • Each position: at least one bullet demonstrates a soft skill or experience mentioned in the JD (e.g. collaboration, mentoring, cross-functional work)
                       • If any violations above, rephrase to fix

                    4) Summary Content
                       • Must not contain percentages, "percent", or "%"
                       • Remove or rephrase any such phrasing

                    5) Technology Formatting in Experience Bullets
                       • Every technology and skill name MUST be wrapped in ** (e.g. **Node.js**, **React**, **PostgreSQL**)
                       • Scan each bullet and bold any tech/skill that is still in plain text

                    6) Experience — Skills Per Position
                       • Each position: at least 7–10 distinct skills/technologies across its bullets.
                       • If under 7, add relevant tech to existing bullets; keep each bullet’s stack coherent (no mixing e.g. Python and Node.js in one bullet).

                    7) Experience — Coherent Stack Per Bullet
                       • In each bullet, only skills that fit that project
                       • Do not mix unrelated backend languages or stacks in one bullet; rephrase or split if needed

                    8) Skills Section (SECTION 5)
                       • Verify: 5–9 categories covering JD-required areas + role-relevant extras; 10–15 items per category (Programming Languages: 6–9 items—JD languages first, then JavaScript, Node.js, Python, SQL at the end).
                       • Labels clear and standard; add or trim using baseline pool so categories are neither empty nor stuffed.

                    9) ATS Compliance
                       • Summary and experience include JD keywords where natural
                       • Job title and skills use standard spellings
                       • No exotic characters in generated text

                    10) Measurable Results & Achievements
                       • Most recent position (firstJob): at most 1 bullet with measurable results. Older positions (secondJob, thirdJob, fourthJob, fifthJob): each at least 1 and at most 2. Do NOT put multiple measurable bullets in the latest job.
                       • Use concrete metrics (response times, throughput, scale, efficiency gains, cost savings, error reduction, test coverage, etc.); prefer absolute units over percentages
                       • Metrics must be realistic and contextually appropriate for the project and time period
                       • If the most recent position has more than 1 measurable bullet: move or rephrase so it has at most 1; add or keep 1–2 measurable bullets in older positions so each has at least 1

                    After applying all fixes, output the complete, corrected resume in the schema format.`
            }
        ],
        response_format: zodResponseFormat(generatedResumeExtracted, "resume_extraction"),
    });

    const resumeData = JSON.parse(completion.choices[0].message.content);
    console.log('Generated resume data:', resumeData);

    JOB_FIELD_NAMES.forEach((field) => {
        const titleKey = `${field}Title`;
        if (resumeData[titleKey] != null) {
            resumeData[field] = resumeData[titleKey];
        }
    });

    return resumeData;
}

const generateResume = async (jobDescription, templatePath, profileName = null, companyName = null, companies = null) => {
    try {
        console.log('Starting resume generation...');

        // Use profileName for name, fallback to default
        const candidateInfo = {
            name: profileName && String(profileName).trim() ? String(profileName).trim() : DEFAULT_COMPANY_INFO.name,
            companies: companies && Array.isArray(companies) && companies.length > 0
                ? companies
                : [...DEFAULT_COMPANY_INFO.companies]
        };

        // Ensure we have at least 2 companies, up to 5
        const numCompanies = Math.min(Math.max(candidateInfo.companies.length, 2), 5);
        candidateInfo.companies = candidateInfo.companies.slice(0, numCompanies);

        // profileName = Name of Template (from DB), used for generated filename only
        const templateProfileName = profileName && String(profileName).trim() ? String(profileName).trim() : null;

        // Build dynamic schema based on number of companies
        const jobFieldNames = JOB_FIELD_NAMES.slice(0, numCompanies);

        const schemaFields = {
            summary: z.string(),
            skills: z.array(z.string()),
        };

        // Add job title and bullet fields only for the companies we're generating (2–5)
        jobFieldNames.forEach(field => {
            schemaFields[`${field}Title`] = z.string();
            schemaFields[`${field}Bullets`] = getExperienceFieldSchema(field);
        });

        const generatedResumeExtracted = z.object(schemaFields);

        // Single completion: generate and polish resume content in one pass (experience prompts built inside runResumeCompletion)
        const resumeData = await runResumeCompletion(
            jobDescription,
            candidateInfo,
            numCompanies,
            generatedResumeExtracted
        );

        stripVersionNumbersFromResume(resumeData);

        if (!mustNotIncludePercentagesInSummary(resumeData.summary)) {
            // Last-resort safety: remove percent sign / words if they slip through.
            // (We avoid heavy rewriting here to keep structure stable.)
            resumeData.summary = String(resumeData.summary || '')
                .replace(/%/g, '')
                .replace(/\bpercentages?\b/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        // Generate the DOCX document
        const buffer = await exportResume(resumeData, templatePath);

        // Save a copy to outputs/custom folder (Render Disk: /var/data/outputs/custom)
        // const outputsDir = path.join(OUTPUTS_DIR, 'custom');
        // ensureDirSync(outputsDir);

        // Generate filename: use Template profileName (Name of Template) when available, else candidate name from companyInfo
        const nameForFile = (templateProfileName || 'resume') + (companyName ? '_' + companyName : '');
        const sanitizedName = nameForFile.replace(/[<>:"/\\|?*]/g, '-').trim();
        const randomTwoDigits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        const filename = `${sanitizedName}_${randomTwoDigits}.docx`;
        // const outputPath = path.join(outputsDir, filename);

        // fs.writeFileSync(outputPath, buffer);

        console.log('Resume generated successfully:', filename);

        return {
            buffer,
            filename,
            resumeData
        };

    } catch (error) {
        console.error('Error in generateResume:', error);
        throw error;
    }
};

/**
 * Parse "Category: skill1, skill2" or "**Category**: skill1, skill2" into category + items.
 */
function parseSkillLine(line) {
    const s = String(line || '').trim();
    const boldMatch = s.match(/^\s*\*\*(.+?)\*\*:\s*(.*)$/s);
    if (boldMatch) return { category: boldMatch[1].trim(), items: boldMatch[2].trim() };
    const colonIndex = s.indexOf(':');
    if (colonIndex === -1) return { category: s.replace(/^\*\*|\*\*$/g, '').trim(), items: '' };
    const category = s.slice(0, colonIndex).replace(/^\s*\*\*|\*\*$/g, '').trim();
    const items = s.slice(colonIndex + 1).trim();
    return { category, items };
}

/**
 * Format skills the same way as experience bullets: array of { bullet: [ { bold, plain }, ... ] }
 * so the DOCX template can use the same layout/placeholders as company experience.
 * Prepends a newline before each category for easier reading.
 */
function formatSkillsLikeBullets(skillsArray) {
    if (!Array.isArray(skillsArray)) return [];
    return skillsArray.map((line) => {
        const { category, items } = parseSkillLine(line);
        const segments = [
            { bold: '', plain: '\n\n' },
            { bold: category, plain: '' },
            { bold: '', plain: (items ? ': ' + items : '') }
        ];
        return { bullet: segments };
    });
}

const exportResume = async (resume, templatePath) => {
    try {
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true
        });

        // Skills: same format as experience bullets so template can use {#skills}{#bullet}{bold}{plain}{/bullet}{/skills}
        const skillsForTemplate = formatSkillsLikeBullets(resume.skills);

        // Build options dynamically based on what exists in resume data
        const options = {
            summary: resume.summary ? resume.summary.replace(/\*/g, '') : '',
            skills: skillsForTemplate,
        };

        // Template placeholders: {firstJob}…{fifthJob} (1:1 with resume fields)
        const jobFieldMapping = {
            firstJob: 'firstJob',
            secondJob: 'secondJob',
            thirdJob: 'thirdJob',
            fourthJob: 'fourthJob',
            fifthJob: 'fifthJob'
        };

        Object.keys(jobFieldMapping).forEach(templateKey => {
            if (resume[templateKey]) {
                options[templateKey] = resume[templateKey];
            }
        });

        if (resume.firstJob) {
            options['title'] = resume.firstJob;
        }

        // Map experience bullets dynamically (matches DOCX placeholders: {bullets1}…{bullets5})
        const experienceFieldMapping = {
            bullets1: 'firstJobBullets',
            bullets2: 'secondJobBullets',
            bullets3: 'thirdJobBullets',
            bullets4: 'fourthJobBullets',
            bullets5: 'fifthJobBullets'
        };

        Object.keys(experienceFieldMapping).forEach(templateKey => {
            const resumeKey = experienceFieldMapping[templateKey];
            if (resume[resumeKey] && Array.isArray(resume[resumeKey]) && resume[resumeKey].length > 0) {
                options[templateKey] = formatBullets(resume[resumeKey]);
            }
        });

        doc.render(options);
        const buf = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE'
        });

        return buf;
    } catch (error) {
        console.error('Error in exportResume:', error);
        throw new Error('Failed to generate document from template');
    }
};

const formatBullets = (bulletsArray) => {
    return bulletsArray.map((bullet) => {
        let words = bullet.split('**');
        const segments = words.map((word, index) => ({
            bold: index % 2 === 1 ? word : '',
            plain: index % 2 === 0 ? word : ''
        }));
        return { bullet: segments };
    });
};

module.exports = {
    generateResume
};
