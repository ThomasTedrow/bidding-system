const OpenAI = require('openai');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// One model knob for all three calls (generation, company research, skills review)
const MODEL = 'gpt-4.1-mini';

// ---------- shared helpers ----------

// ==========================================================================
// SHARED HELPERS
// ==========================================================================
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// run fn over every position's bullets array that exists on resumeData
function mapBulletLists(resumeData, fn) {
    JOB_FIELD_NAMES.forEach((field) => {
        const key = `${field}Bullets`;
        if (Array.isArray(resumeData[key])) resumeData[key] = resumeData[key].map(fn);
    });
}

// ==========================================================================
// COMPANY RESEARCH (web-search grounding, cached)
// ==========================================================================
// ponytail: process-lifetime cache, no TTL; add TTL only if stale company info is ever reported.
const companyResearchCache = new Map();

// Looks up what a company builds/sells via the OpenAI Responses API's built-in web search, for
// grounding experience bullets in a real domain. Never throws — degrades to '' on any failure,
// so a bad company name or a down search tool never blocks resume generation.
async function researchCompany(name) {
    if (companyResearchCache.has(name)) return companyResearchCache.get(name);

    let timer;
    const research = await Promise.race([
        openai.responses.create({
            model: MODEL,
            tools: [{ type: 'web_search_preview' }],
            input: `In 3-4 factual sentences: what does the software company "${name}" build or sell — its main products, domain, and technology space? If you cannot find it, reply exactly UNKNOWN.`
        }).then(r => (r.output_text || '').trim()),
        new Promise(resolve => { timer = setTimeout(() => resolve(''), 10000); })
    ]).catch(() => '').finally(() => clearTimeout(timer)); // don't hold the event loop open after resolution

    const result = research === 'UNKNOWN' ? '' : research;
    companyResearchCache.set(name, result);
    return result;
}

// ==========================================================================
// CONFIGURATION — skills pool
// ==========================================================================
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

// ==========================================================================
// TEXT SCRUBBERS (percent, versions, AI-isms)
// ==========================================================================
// Catches "15%", "15 percent(s)/percentage(s)", "per cent" — summary must contain none of these.
function containsPercentageLike(text) {
    return /%|\bper\s*cent\b|\bpercent(age)?s?\b/i.test(String(text || ''));
}

// Remove version numbers after technology names (e.g. "PHP 8" → "PHP", "Zend Framework 1" → "Zend Framework")
function stripTechVersions(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\b(Zend Framework|Node\.js|Express\.js|Next\.js|React\.js|Tailwind CSS|PHP|React|Angular|Vue|Python|Java|TypeScript|Laravel|Django|Rails|Redis|MySQL|PostgreSQL|MongoDB|jQuery|Bootstrap|Kubernetes|Docker|Terraform|GraphQL|Redux|Webpack|Jest|Cypress)\s+\d+(\.\d+)*\b/gi, '$1');
}

// Deterministic AI-ism scrub — the prompt bans these words but the model still slips them in.
// ponytail: fixed word map, capitalization-preserving; extend the list only when a new AI-ism shows up in real output.
const AI_ISM_SWAPS = [
    [/\bspearheaded\b/gi, 'led'], [/\bspearheading\b/gi, 'leading'], [/\bspearheads?\b/gi, 'leads'],
    [/\butilizing\b/gi, 'using'], [/\butilized\b/gi, 'used'], [/\butilizes\b/gi, 'uses'], [/\butilize\b/gi, 'use'],
    [/\bleveraging\b/gi, 'using'], [/\bleveraged\b/gi, 'used'], [/\bleverages\b/gi, 'uses'], [/\bleverage\b/gi, 'use'],
    [/\bseamlessly\b/gi, 'smoothly'], [/\bseamless\b/gi, 'smooth'],
    [/\brobustness\b/gi, 'reliability'], [/\brobust\b/gi, 'reliable'],
    [/\bdelved\b/gi, 'dug'], [/\bdelve\b/gi, 'dig']
];

function stripAiIsms(text) {
    if (typeof text !== 'string') return text;
    let out = text;
    AI_ISM_SWAPS.forEach(([re, to]) => {
        out = out.replace(re, (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to));
    });
    return out;
}

function stripAiIsmsFromResume(resumeData) {
    if (resumeData.summary) resumeData.summary = stripAiIsms(resumeData.summary);
    mapBulletLists(resumeData, stripAiIsms);
}

function stripVersionNumbersFromResume(resumeData) {
    if (resumeData.summary) resumeData.summary = stripTechVersions(resumeData.summary);
    if (Array.isArray(resumeData.skills)) resumeData.skills = resumeData.skills.map(stripTechVersions);
    mapBulletLists(resumeData, stripTechVersions);
}

// ==========================================================================
// CONFIGURATION — positions, seniority, prompt fragments
// ==========================================================================
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
const JOB_FIELD_NAMES = ['firstJob', 'secondJob', 'thirdJob', 'fourthJob', 'fifthJob', 'sixthJob'];
const MAX_COMPANIES = 6;

// Bullet count constraints per position (recent-heavy, tapering — see RESUME_QUALITY_PLAN.md Phase 2)
const EXPERIENCE_BULLET_CONSTRAINTS = {
    'firstJob': { min: 10, max: 12, skillsMin: 12, skillsMax: 16 },
    'secondJob': { min: 7, max: 8, skillsMin: 8, skillsMax: 12 },
    'thirdJob': { min: 5, max: 6, skillsMin: 7, skillsMax: 10 },
    'fourthJob': { min: 4, max: 5, skillsMin: 7, skillsMax: 10 },
    'fifthJob': { min: 3, max: 4, skillsMin: 5, skillsMax: 8 },
    'sixthJob': { min: 3, max: 4, skillsMin: 5, skillsMax: 8 }
};

// Seniority levels per bullet field based on company count
// Pattern: first ceil(n/2) positions are Senior; older roles are Entry-level
const EXPERIENCE_SENIORITY_LEVELS = {
    'firstJob': {
        2: 'Senior',
        3: 'Senior',
        4: 'Senior',
        5: 'Senior',
        6: 'Senior'
    },
    'secondJob': {
        2: 'Entry-level',
        3: 'Senior',
        4: 'Senior',
        5: 'Senior',
        6: 'Senior'
    },
    'thirdJob': {
        3: 'Entry-level',
        4: 'Entry-level',
        5: 'Senior',
        6: 'Senior'
    },
    'fourthJob': {
        4: 'Entry-level',
        5: 'Entry-level',
        6: 'Entry-level'
    },
    'fifthJob': {
        5: 'Entry-level',
        6: 'Entry-level'
    },
    'sixthJob': {
        6: 'Entry-level'
    }
};

// Seniority descriptions for prompts
const SENIORITY_DESCRIPTIONS = {
    'Senior': 'Show leading features end-to-end, owning services, raising quality via testing/observability, collaborating with product/security/infra.',
    'Entry-level': 'Show growth, implementing scoped features, fixing bugs, writing tests, following code reviews, delivering under guidance (avoid senior-level ownership claims).',
    'Intern': 'This is an INTERNSHIP (the template labels it as such): show learning and well-scoped contribution—implemented small features, fixed bugs, wrote tests, incorporated feedback from senior engineers. NEVER claim ownership, mentoring, leading others, architecture decisions, or production on-call duty.'
};

// Static per-position prompt fragments (selected by position/seniority inside the prompt loop)
const ALIGN_WITH_JD = {
    first: 'Relevant to JD domain/tech but write DISTINCT projects—do not paraphrase or mirror JD responsibilities; describe different problem spaces and deliverables that happen to use JD-relevant skills. The first 2 bullets must make the reader feel this candidate is exactly the expert the JD is asking for: lead with the JD\'s core technologies and the strongest, most senior contributions. Use the JD\'s core tech stack, but describe DISTINCT projects and outcomes—never paraphrase JD responsibility lines.',
    other: 'Use JD-relevant tech where appropriate; technologies historically accurate for this period. Do not copy JD wording.'
};

const SOFT_SKILL_WEAVE = {
    senior: 'Weave items from jdSoftSkills naturally into bullet prose—interpersonal skills through concrete actions (led, mentored, partnered with product/design) and working-style/culture signals through framing (rapid delivery, owning ambiguous problems end to end, mission alignment)—never as a listed skill or bare adjective; at least one such bullet in this position.',
    junior: 'Weave items from jdSoftSkills naturally into bullet prose—through junior-appropriate actions and framing (collaborated with teammates, communicated findings, incorporated code-review feedback, fast learning, organized delivery in a fast-paced team)—never as a listed skill or bare adjective; at least one such bullet in this position. NEVER claim mentoring, leadership, or team ownership in this position.'
};

// ==========================================================================
// TEMPLATE-FIRST SIGNALS (blocks, Intern labels, printed dates)
// ==========================================================================
// TEMPLATE FIRST: a position without a {bulletsN} block in the template never renders — it must not
// be generated or counted (a phantom 4th company once inflated "9.6 years" to "11+ years").
// Signals [] (unreadable template) → keep the requested count; fewer than 2 blocks → keep (2 is the floor).
function renderableCompanyCount(templateSignals, requested) {
    if (!Array.isArray(templateSignals) || templateSignals.length === 0) return requested;
    const blocks = templateSignals.filter(Boolean).length;
    return blocks >= 2 ? Math.min(requested, blocks) : requested;
}

// TEMPLATE FIRST: static text printed in the docx overrides DB data. For each {#bulletsN} block,
// read the header text above it and extract (a) an Intern label, (b) the printed date range.
// ponytail: regex over stripped document.xml, month-name or MM/YYYY formats only; extend the
// period regex only when a real template uses a format it misses. Any error → [] (old behavior).
const MONTH_NUM = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function extractTemplateSignals(template) {
    try {
        const data = Buffer.isBuffer(template) ? template : fs.readFileSync(template);
        const xml = new PizZip(data).file('word/document.xml').asText();
        const text = xml.replace(/<[^>]+>/g, '');
        const signals = [];
        for (let i = 1; i <= MAX_COMPANIES; i++) {
            const at = text.indexOf(`{#bullets${i}}`);
            if (at === -1) { signals.push(null); continue; }
            const prevEnd = i > 1 ? text.indexOf(`{/bullets${i - 1}}`) : -1;
            const header = text.slice(Math.max(prevEnd, at - 300, 0), at);

            // no \b or /i: run concatenation produces "InternIterable"; lookaheads reject "internal"/"INTERNAL"
            const isIntern = /INTERN(SHIP|S)?(?![A-Z])|[Ii]ntern(ship|s)?(?![a-z])/.test(header);

            let period = null;
            // no leading \b: XML tag-stripping concatenates runs ("IterableJul 2019")
            const monthRe = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\s*(?:–|—|-|to)+\s*(?:(present)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4}))/i;
            const numRe = /\b(\d{1,2})\/(\d{4})\s*(?:–|—|-|to)+\s*(present|\d{1,2}\/\d{4})/i;
            const m = header.match(monthRe);
            const n = header.match(numRe);
            if (m) {
                const end = m[3] ? 'Present' : `${MONTH_NUM[m[4].toLowerCase()]}/${m[5]}`;
                period = `${MONTH_NUM[m[1].toLowerCase()]}/${m[2]} - ${end}`;
            } else if (n) {
                period = `${n[1].padStart(2, '0')}/${n[2]} - ${/present/i.test(n[3]) ? 'Present' : n[3]}`;
            }

            signals.push({ isIntern, period });
        }
        return signals;
    } catch (e) {
        return [];
    }
}

// ==========================================================================
// HISTORY & ERA (experience years, temporal gating)
// ==========================================================================
// Mainstream-adoption year per technology, used to forbid anachronistic tech per position.
// ponytail: coarse adoption-year map, single flat object; upgrade to per-tech {start,end} ranges only if deprecated-tech leakage (e.g. jQuery in 2024 roles) becomes a real problem.
const TECH_ADOPTION_YEARS = {
    'React': 2015, 'React Hooks': 2019, 'Angular': 2012, 'Vue': 2016, 'Next.js': 2018, 'TypeScript': 2017,
    'Node.js': 2011, 'GraphQL': 2016, 'Tailwind CSS': 2020, 'Docker': 2014, 'Kubernetes': 2017, 'Terraform': 2017,
    'GitHub Actions': 2020, 'Rust': 2019, 'Go': 2014, 'Kafka': 2015, 'Spark': 2015, 'Airflow': 2018, 'Redis': 2011,
    'MongoDB': 2011, 'AWS': 2008, 'Azure': 2012, 'GCP': 2013, 'AWS Lambda': 2016, 'Serverless': 2016,
    'Microservices': 2015, 'CI/CD': 2013, 'LLM': 2023, 'ChatGPT': 2023, 'GenAI': 2023, 'RAG': 2023,
    'LangChain': 2023, 'GitHub Copilot': 2022, 'MLOps': 2019, 'Flutter': 2018, 'React Native': 2016
};

// Parse "MM/YYYY - MM/YYYY" or "MM/YYYY - Present" into { startYear, endYear }. Returns null if unparseable.
function parsePeriodYears(period) {
    const s = String(period || '');
    const match = s.match(/(\d{1,2})\/(\d{4})\s*-\s*(Present|(\d{1,2})\/(\d{4}))/i);
    if (!match) return null;
    const startYear = parseInt(match[2], 10);
    const endYear = /present/i.test(match[3]) ? new Date().getFullYear() : parseInt(match[5], 10);
    return { startYear, endYear };
}

// Total years of PROFESSIONAL experience = sum of the durations listed in the history,
// excluding internships/university-era positions (month-accurate, floored).
function totalExperienceYears(companies, internFlags = []) {
    let months = 0;
    (companies || []).forEach((c, i) => {
        if (internFlags[i]) return; // internships are not professional experience
        const m = String(c.period || '').match(/(\d{1,2})\/(\d{4})\s*-\s*(Present|(\d{1,2})\/(\d{4}))/i);
        if (!m) return;
        const start = parseInt(m[2], 10) * 12 + parseInt(m[1], 10) - 1;
        const end = /present/i.test(m[3])
            ? new Date().getFullYear() * 12 + new Date().getMonth()
            : parseInt(m[5], 10) * 12 + parseInt(m[4], 10) - 1;
        if (end > start) months += end - start;
    });
    return Math.floor(months / 12);
}

// The prompt states the computed total, but the model can still write its own number.
// Normalize the summary's experience claim to the computed value ("over 8 years" → "10+ years").
// Intern positions are excluded via the template-first flags, plus the generated titles as fallback.
function fixExperienceYears(resumeData, companies, internFlags = []) {
    const flags = (companies || []).map((c, i) =>
        !!internFlags[i] || /intern/i.test(String(resumeData[`${JOB_FIELD_NAMES[i]}Title`] || '')));
    const total = totalExperienceYears(companies, flags);
    if (!total || !resumeData.summary) return;
    const re = /\b(?:over\s+|more than\s+|nearly\s+)?\d{1,2}\+?\s+years?\b/i;
    const current = resumeData.summary.match(re);
    if (!current) return;
    const replacement = `${total}+ years`;
    if (current[0] !== replacement) {
        resumeData.summary = resumeData.summary.replace(re, replacement);
        console.warn(`Experience years corrected: "${current[0]}" → "${replacement}" (computed from history)`);
    }
}

// Techs that were not yet mainstream by the given end year (forbidden for that position).
function getForbiddenTechForEndYear(endYear) {
    return Object.entries(TECH_ADOPTION_YEARS).filter(([, year]) => year > endYear).map(([tech]) => tech);
}

// Warn (do not rewrite) when a position's bullets mention a tech forbidden for its era.
// ponytail: warn-only gate; upgrade path = one retry appending the violation list to the messages if warnings show up in real runs.
function warnTemporalViolations(resumeData, companies) {
    JOB_FIELD_NAMES.forEach((field, i) => {
        const bullets = resumeData[`${field}Bullets`];
        const company = companies && companies[i];
        if (!Array.isArray(bullets) || !company) return;
        const years = parsePeriodYears(company.period);
        if (!years) return;
        const forbidden = getForbiddenTechForEndYear(years.endYear);
        const title = resumeData[`${field}Title`];
        if (title && years.endYear < 2019 && /\b(AI|ML|LLM|Machine Learning)\b/i.test(title)) {
            console.warn(`Temporal violation: AI/ML-era title "${title}" in ${field} (ended ${years.endYear})`);
        }
        if (forbidden.length === 0) return;
        const forbiddenRe = new RegExp(`\\b(${forbidden.map(escapeRegex).join('|')})\\b`, 'gi');
        const hits = new Set((bullets.join(' ').match(forbiddenRe) || []).map(t => t.toLowerCase()));
        hits.forEach((hit) => {
            const tech = forbidden.find(t => t.toLowerCase() === hit) || hit;
            console.warn(`Temporal violation: "${tech}" in ${field} (ended ${years.endYear})`);
        });
    });
}

// ==========================================================================
// SKILLS HYGIENE (extraction guards)
// ==========================================================================
// Deterministic guard: benefits/compensation terms are never skills, even if extraction slips them in.
// Filters the extraction lists post-parse so neither the backfill nor the coverage warns ever see them.
// ponytail: generic-English benefits regex; extend only when a new benefits term actually leaks in a real run.
const BENEFIT_RE = /\b(401\s*\(?k\)?|insurance|salar(y|ies)|compensation|PTO|paid time off|vacation|holidays?|sick days?|dental|vision plan|medical plan|health care|healthcare plan|parental leave|bereavement|reimbursement|benefits?|perks?|equity|stock options?|e-?verify|gym|remote work polic)/i;

// Bare channel/medium nouns are never skills on their own ("email" is not a skill; "email marketing
// automation" is). Exact-match on the whole item so compound skill phrases pass through.
const NONSKILL_EXACT_RE = /^(e-?mail|sms|mail|direct mail|social media|phone( calls)?|text messag\w*|slack|zoom)$/i;

const isNonSkill = (item) => BENEFIT_RE.test(item) || NONSKILL_EXACT_RE.test(String(item).trim());

// Work products are documents a role PRODUCES, not skills: they belong in bullet prose ("authored
// statements of work for..."), never as skills-section items. They stay in jdHardSkills so the
// bullet-coverage machinery still pushes them into experience prose for ATS matching.
// ponytail: PM/consulting work-product list; extend when a new artifact type shows up in real output.
const WORK_PRODUCT_RE = /statements? of work|work breakdown structures?|level of effort|staff(ing)? plans?|status reports?|meeting (minutes|notes)|lessons learned|project charters?|RFP responses?|SOWs?\b/i;

function stripNonSkillTerms(resumeData) {
    ['jdHardSkills', 'jdSoftSkills'].forEach((key) => {
        if (!Array.isArray(resumeData[key])) return;
        resumeData[key] = resumeData[key].filter((item) => {
            if (isNonSkill(item)) {
                console.warn(`Extraction leak filtered: "${item}" (not a skill)`);
                return false;
            }
            return true;
        });
    });
}

// Placeholder text the model writes when a category has no relevant skills ("None is relevant for
// this skill", "N/A", "undefined") — never a real skill; the category line is dropped once emptied.
const PLACEHOLDER_ITEM_RE = /^(none|n\/?a|not applicable|nothing|undefined|null)\b/i;

// The model can also write non-skill items straight into a skills category; scrub them from the final lines.
function scrubSkillItems(resumeData) {
    if (!Array.isArray(resumeData.skills)) return;
    resumeData.skills = resumeData.skills.map((line) => {
        const { category, items } = parseSkillLine(line);
        if (!items) return line;
        const kept = items.split(',').map(s => s.trim()).filter(Boolean).filter((item) => {
            if (PLACEHOLDER_ITEM_RE.test(item)) {
                console.warn(`Skill item scrubbed: "${item}" from "${category}" (placeholder, category dropped if emptied)`);
                return false;
            }
            if (isNonSkill(item) || WORK_PRODUCT_RE.test(item)) {
                console.warn(`Skill item scrubbed: "${item}" from "${category}" (${WORK_PRODUCT_RE.test(item) ? 'work product, belongs in bullets' : 'not a skill'})`);
                return false;
            }
            return true;
        });
        return `${category}: ${kept.join(', ')}`;
    }).filter((line) => parseSkillLine(line).items !== '');
}

// ==========================================================================
// COVERAGE & QUALITY WARNS
// ==========================================================================
// Warn-only visibility into ATS coverage: era-eligible hard skills missing from all bullets,
// soft skills missing from summary+bullets. Everything derives from the JD extraction at runtime.
// ponytail: crude 5-char word-stem matching (catches mentored/mentoring); upgrade only if warnings prove noisy.
// Inflection/hyphenation-tolerant skill matching, shared by coverage warns and the backfill:
// exact substring OR every >=4-char word's 5-char stem present ("data-lake" matches "data lakes").
const skillStems = (s) => String(s).toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length >= 4).map(w => w.slice(0, 5));
const skillFound = (skill, haystackLower) =>
    haystackLower.includes(String(skill).toLowerCase()) || skillStems(skill).every(st => haystackLower.includes(st));

function warnCoverageGaps(resumeData, companies) {
    const bulletsText = JOB_FIELD_NAMES.flatMap(f => resumeData[`${f}Bullets`] || []).join(' ').toLowerCase();
    const proseText = `${resumeData.summary || ''} ${bulletsText}`.toLowerCase();

    // a hard skill forbidden in EVERY position (per era rules) is exempt from the bullet requirement
    const maxEndYear = Math.max(...(companies || []).map(c => (parsePeriodYears(c.period) || {}).endYear || 0));
    (resumeData.jdHardSkills || []).forEach((skill) => {
        const adoption = TECH_ADOPTION_YEARS[skill];
        if (adoption && maxEndYear && adoption > maxEndYear) return;
        if (!skillFound(skill, bulletsText)) console.warn(`Coverage gap: hard skill "${skill}" not in any bullet`);
    });
    (resumeData.jdSoftSkills || []).forEach((skill) => {
        if (!skillFound(skill, proseText)) console.warn(`Coverage gap: soft skill "${skill}" not woven into summary or bullets`);
    });
}

// Warn-only vendor-conflict check: a position must not claim a rival platform of its own employer.
// ponytail: big-3 cloud rivalry map only; extend when a real conflict shows up in actual output.
const VENDOR_CONFLICTS = [
    { employer: /amazon|(^|[^a-z])aws([^a-z]|$)/i, rival: /\bazure\b|\bgcp\b|google cloud/i },
    { employer: /microsoft|(^|[^a-z])azure([^a-z]|$)/i, rival: /\baws\b|amazon web services|\bgcp\b|google cloud/i },
    { employer: /google/i, rival: /\baws\b|amazon web services|\bazure\b/i }
];

function warnVendorConflicts(resumeData, companies) {
    JOB_FIELD_NAMES.forEach((field, i) => {
        const company = companies && companies[i];
        const bullets = resumeData[`${field}Bullets`];
        if (!company || !Array.isArray(bullets)) return;
        const rule = VENDOR_CONFLICTS.find(v => v.employer.test(company.name));
        if (!rule) return;
        bullets.forEach((bullet) => {
            const hit = bullet.match(rule.rival);
            if (hit) console.warn(`Vendor conflict: "${hit[0]}" claimed in ${field} while employed at ${company.name}`);
        });
    });
}

// Warn-only impact density: at least half of each position's bullets should carry a quantified result.
// ponytail: regex for metric-shaped numbers (unit-suffixed or from-X-to-Y) so digit-bearing tech names
// (HTML5, S3, OAuth 2.0) don't count as metrics; tune the unit list only if warns prove wrong in real runs.
const METRIC_RE = /\bfrom\s+\d|\b\d[\d,.]*\s*(%|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|[kKM]\b|million|thousand|billion|TB\b|GB\b|PB\b|users?\b|requests?\b|records?\b|merchants?\b|customers?\b|clients?\b|engineers?\b|tickets?\b|incidents?\b|releases?\b|deployments?\b|x\b)/;

// Flagship model: 2-3 quantified bullets per senior position, ~1 for short/junior blocks —
// warn on BOTH failure modes: no metrics at all, and metric stuffing (reads fabricated).
function warnImpactBalance(resumeData) {
    JOB_FIELD_NAMES.forEach((field) => {
        const bullets = resumeData[`${field}Bullets`];
        if (!Array.isArray(bullets) || bullets.length === 0) return;
        const isIntern = /intern/i.test(String(resumeData[`${field}Title`] || ''));
        const target = isIntern ? 1 : (bullets.length >= 10 ? 3 : (bullets.length >= 6 ? 2 : 1));
        const quantified = bullets.filter(b => METRIC_RE.test(b)).length;
        if (quantified < target) {
            console.warn(`Impact balance: ${field} has ${quantified}/${bullets.length} quantified bullets — below flagship target ${target}`);
        } else if (quantified > target + 1) {
            console.warn(`Impact balance: ${field} has ${quantified}/${bullets.length} quantified bullets (flagship target: ${target} — reads metric-stuffed)`);
        }
        const percents = bullets.filter(b => /%/.test(b)).length;
        if (percents > 1) {
            console.warn(`Impact balance: ${field} uses a bare % in ${percents} bullets (at most 1 per position)`);
        }
    });
}

// ==========================================================================
// SKILLS FILTERS & COVERAGE BACKFILL
// ==========================================================================
// Deterministic guard: a language in the Programming Languages category must be justified by the JD
// or by the resume's own experience prose — otherwise it's pool padding (e.g. C++/PHP on a data role).
// Exact-boundary matching on purpose: stem matching would let short tokens (C#, Go, R) pass trivially.
function filterIrrelevantLanguages(resumeData, jobDescription) {
    if (!Array.isArray(resumeData.skills)) return;
    const idx = resumeData.skills.findIndex((line) => /programming languages/i.test(parseSkillLine(line).category));
    if (idx === -1) return;

    const evidence = [
        jobDescription,
        resumeData.summary,
        ...JOB_FIELD_NAMES.flatMap((f) => resumeData[`${f}Bullets`] || [])
    ].join(' ');
    const justified = (lang) =>
        new RegExp(`(^|[^A-Za-z0-9+#])${escapeRegex(String(lang).trim())}([^A-Za-z0-9+#]|$)`, 'i').test(evidence);

    const MIN_LANGUAGES = 5;
    const { category, items } = parseSkillLine(resumeData.skills[idx]);
    const all = items.split(',').map(s => s.trim()).filter(Boolean);

    // keep everything justified by JD/prose; top up with the model's own related-language picks
    // (in their original order) so the section never shrinks below MIN_LANGUAGES
    const keptSet = new Set(all.filter(justified));
    for (const lang of all) {
        if (keptSet.size >= MIN_LANGUAGES) break;
        keptSet.add(lang);
    }
    const kept = all.filter((lang) => keptSet.has(lang));
    all.filter((lang) => !keptSet.has(lang))
        .forEach((lang) => console.warn(`Language filtered: "${lang}" not in JD or experience prose (pool padding)`));
    if (kept.length > 0) resumeData.skills[idx] = `${category}: ${kept.join(', ')}`;
}

// Deterministic backstop: append any jdHardSkills item missing from skills + all bullets to the most
// generic skills category, so JD-required coverage never depends solely on the model. Never touches bullets.
// ponytail: naive append-to-last-category gap fill; upgrade to a category-keyword heuristic only if misfiled skills actually bother anyone.
function fillSkillCoverage(resumeData) {
    if (!Array.isArray(resumeData.jdHardSkills) || !Array.isArray(resumeData.skills)) return;

    const haystacks = [
        ...resumeData.skills,
        ...JOB_FIELD_NAMES.flatMap((field) => resumeData[`${field}Bullets`] || [])
    ].join(' \n ');

    // soft skills never belong in the skills section, even when extraction misfiles them as hard
    const softRe = /mentor|collaborat|communicat|leadership|decision making|ownership|curiosit|passion|cross-functional/i;
    const softSet = new Set((resumeData.jdSoftSkills || []).map(s => String(s).toLowerCase()));

    const haystackLower = haystacks.toLowerCase();
    resumeData.jdHardSkills.forEach((skill) => {
        if (softRe.test(skill) || softSet.has(String(skill).toLowerCase())) return;
        if (WORK_PRODUCT_RE.test(skill)) return; // work products are covered in bullets, never in the skills section
        if (skillFound(skill, haystackLower)) return;

        let targetIndex = resumeData.skills.findIndex((line) => parseSkillLine(line).category === 'Methodologies & Tools');
        if (targetIndex === -1) targetIndex = resumeData.skills.length - 1;
        if (targetIndex === -1) return;

        resumeData.skills[targetIndex] = `${resumeData.skills[targetIndex]}, ${skill}`;
        console.warn(`Skill coverage backfill: "${skill}" appended to skills category`);
    });
}

// ==========================================================================
// SCHEMA & PROMPT HELPERS
// ==========================================================================
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

// ==========================================================================
// LLM GENERATION + REVIEW
// ==========================================================================
/**
 * Calls OpenAI to generate the initial resume content (skills, experience bullets, summary, job titles).
 * Returns parsed resume data with *Title keys copied to short names (firstJob, secondJob, etc.).
 */
async function runResumeCompletion(jobDescription, candidateInfo, numCompanies, generatedResumeExtracted, research = [], internFlags = []) {
    // Build experience prompts - one shared prompt template for all positions
    const experiencePrompts = [];
    const positionLabels = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

    const totalYears = totalExperienceYears(candidateInfo.companies, internFlags);
    let wordTarget = 0;
    for (let i = 0; i < numCompanies && candidateInfo.companies[i]; i++) {
        const fieldName = JOB_FIELD_NAMES[i];
        const constraint = EXPERIENCE_BULLET_CONSTRAINTS[fieldName];
        const seniority = internFlags[i] ? 'Intern' : getSeniorityLevel(fieldName, numCompanies);
        const seniorityDesc = SENIORITY_DESCRIPTIONS[seniority];
        const label = positionLabels[i];
        const period = candidateInfo.companies[i].period;
        const bulletCountText = getBulletCountText(fieldName);
        const maxBullets = constraint.max;
        wordTarget += maxBullets * 30;
        const alignWithJd = i === 0 ? ALIGN_WITH_JD.first : ALIGN_WITH_JD.other;

        const years = parsePeriodYears(period);
        const forbidden = years ? getForbiddenTechForEndYear(years.endYear) : [];
        const eraRule = forbidden.length > 0
            ? ` STRICT era rule—this position ended in ${years.endYear}. These technologies were NOT in mainstream use then and must NEVER appear in this position's bullets: ${forbidden.join(', ')}. Use era-appropriate equivalents instead.`
            : '';
        const softSkillWeave = seniority === 'Senior' ? SOFT_SKILL_WEAVE.senior : SOFT_SKILL_WEAVE.junior;
        // flagship quantified-bullet count: 2-3 for senior positions (by tenure/bullet volume), 1 for interns
        const quantTarget = seniority === 'Intern' ? 1 : (constraint.max >= 10 ? 3 : 2);
        const internTitleRule = seniority === 'Intern'
            ? ` This position's title (${fieldName}Title) must be an internship title matching the JD's role area (e.g. "Software Engineering Intern")—never "Senior" or a standalone professional title.`
            : '';
        const companyResearch = research[i];
        const groundingRule = companyResearch
            ? ` Company context (GROUNDING ONLY): ${companyResearch}. Ground this position's projects in this real domain and product space, combined with the era-allowed, JD-relevant skills. COMPANY PLAUSIBILITY BEATS JD ALIGNMENT: if the JD's preferred vendor/platform conflicts with what this employer itself builds or sells (e.g. Azure work at an Amazon/AWS company), use this employer's own or a neutral equivalent stack in THIS position's bullets and satisfy the JD's vendor stack in other, plausible positions instead. NEVER write the company's name or its product names in bullet text—describe the domain generically (e.g. "a freight-logistics SaaS platform", not the product's brand name).`
            : '';

        experiencePrompts.push({
            role: "user",
            content: `Experience — ${label} position (${period}): Write ${bulletCountText} bullet points (max ${maxBullets}), each 25–40 words with one concrete project contribution. Seniority: ${seniority}. ${seniorityDesc} ${alignWithJd} Mention at least ${constraint.skillsMin}–${constraint.skillsMax} distinct skills/technologies across this position's bullets—draw them primarily from jdHardSkills (era-allowed items, in the JD's exact terms), then from jdRelatedSkills (adjacent tech that keeps bullets richer than a JD echo), before any generic filler; across all positions together the bullets should cover as many jdHardSkills as the era rules allow, each in natural project context. ${softSkillWeave} Every bullet ends with a concrete outcome or impact. HARD REQUIREMENT—count before finalizing: EXACTLY ${quantTarget} of this position's bullets (its ${quantTarget} flagship project${quantTarget > 1 ? 's' : ''}—never fewer, never more than ${quantTarget + 1}) must each carry one specific, realistic figure estimated from the project's scale, the company's size, and the era (absolute units like "from 900ms to 210ms" or "2M requests per day" preferred; a bare percentage at most once in this position). Every other bullet states its outcome qualitatively with no digits. Vary metric types and sentence shapes.${internTitleRule}${eraRule}${groundingRule} Output field: ${fieldName}Bullets`
        });
    }

    const bulletCountsChecklist = JOB_FIELD_NAMES.slice(0, numCompanies)
        .map(field => `• ${field} = ${getBulletCountText(field)} bullets`)
        .join('\n                       ');

    const profileLines = [
        `Name: ${candidateInfo.name}`,
        ...candidateInfo.companies.map((c, i) => {
            const label = positionLabels[i][0].toUpperCase() + positionLabels[i].slice(1);
            return `${label} Company: ${c.name} (${c.period})`;
        })
    ].join('\n');

    console.log('Profile:', profileLines);

    const completion = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.4, // low variance: keyword extraction/coverage must be consistent run-to-run for ATS scores
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
                        • Company plausibility beats JD alignment within each position: NEVER claim delivering solutions on a direct competitor's platform while employed by that platform's vendor (no Azure cloud work in a position at Amazon/AWS, no AWS work at Microsoft, no AWS/Azure at Google). Use that employer's own or neutral equivalents there, and place the JD's vendor stack in positions where it is plausible.
                        • Bullets 1–2: name the project by purpose (e.g. "multi-tenant billing platform", "customer dashboard"), what it was for, what you built/shipped. No project codenames (e.g. Atlas, Helios).
                        • Do NOT mirror or paraphrase the JD. Write different, plausible projects (different products/domains/problem spaces) that naturally use some JD tech and skills. Same field or tech stack is enough; never copy JD responsibility list or wording.
                        • Per position: mention the distinct-skills count given in that position's Experience instruction below. Spread them across bullets; do not cram many unrelated skills into one bullet.
                        • Within each bullet, mention only skills that fit that project. Use a coherent stack per bullet—e.g. one backend bullet might use **Node.js**, **Express**, **PostgreSQL**; do not mix unrelated stacks in one bullet (e.g. avoid **Python** and **Node.js** in the same bullet; pick one backend language/framework that fits the project).
                        • First/second position: weave in key JD skills and technologies across bullets, plus extra relevant skills (frameworks, infra, testing, observability). Each bullet = concrete project work (what was built, for whom, outcome)—not a rephrased JD requirement.
                        • Senior positions: include leadership (mentoring, technical direction, cross-team alignment, ownership of scope).
                        • Per position: include at least one bullet that demonstrates a soft skill or behavioral trait mentioned in the JD (e.g. collaboration, communication, mentoring, ownership, cross-functional work)—weave it into concrete project context, not as a standalone claim. Match the trait to the position's seniority: mentoring/leadership claims ONLY in Senior positions; Entry-level positions show collaboration and learning, NEVER mentoring or leading others.
                        • Impact & Results: every bullet states a concrete outcome or impact—what improved, sped up, scaled, or got saved—and each position carries EXACTLY its flagship count of quantified bullets (2–3 for senior positions, 1 for internships; the exact number is in each position's Experience instruction). Never fewer—a position with zero figures undersells—and never more than one extra: a resume where most bullets carry metrics reads fabricated. Figures are estimated realistically from the project's scale, the company's size, and the era. Prefer absolute units over bare percentages (e.g. "reduced from 500ms to 50ms" not "by 90%"; a bare % at most once per position). All other bullets state their outcome qualitatively with no digits. Never the same "improved X by N" template twice. Intern/entry outcomes stay junior-scale (test coverage, bug backlog, processing time).
                        • The experience section should total approximately ${wordTarget} words.

                        Formatting Requirements:
                        • No company names in bullets; write generically ("Led development of..." not "at CompanyX"). No "Tech stack:" or "How:" labels—weave tech into prose.
                        • EVERY technology and skill name in experience MUST be bolded: wrap each in ** (e.g. **Node.js**, **React**, **PostgreSQL**). No tech in plain text.
                        • Technologies historically accurate per period (e.g. React Hooks 2019, TypeScript 2018–2019, Docker 2014–2015, Kubernetes 2017–2018, ChatGPT/LLMs 2023).

                        SECTION 2: JOB TITLES

                        • Seniority: only "Senior" prefix or none. No Junior/Mid/Associate. Senior → "Senior X"; Entry → "X" only. Exception: positions marked as internships in their Experience instruction use an "<Role> Intern" title.
                        • Match JD title type (Developer/Engineer); prefer "Developer" if unclear. Map: Rust/Python/Java/C#/Ruby/Go/PHP → Backend; React/Vue/JS/Angular → Frontend; AI/LLM/NLP/GenAI → AI; Data/ETL/Spark/Airflow → Data Engineer; ML/MLOps → ML; DevOps/SRE/K8s/CI-CD → DevOps; unknown → Software Engineer.
                        • Never include language/framework names in per-position job titles. JD "Senior Full Stack PHP Developer" → output "Senior Full Stack Developer". Use only role type (Full Stack Developer, Backend Developer, etc.) + seniority prefix if applicable. (The resumeTitle headline's specialization tail below is the ONLY exception.)
                        • Per-position titles must be era- and seniority-plausible: NEVER an AI/ML-flavored title (AI Engineer, ML Engineer, LLM Engineer) for a position ending before 2019—use the era-appropriate plain title instead (Software Engineer, Backend Developer, Full Stack Developer). Entry-level positions get plain titles without specialty inflation, and each position's title must match what its own bullets describe.
                        • resumeTitle is a natural HEADLINE, never a bare copy of the JD's title. Structure: (1) the JD's role title normalized per the rules above—this exact phrase must appear first so ATS title-matching hits—then (2) " | " and a short specialization tail of 2–4 words drawn from the strongest JD-matching stack or domain in the GENERATED history (e.g. "Senior Data Engineer | Spark & Cloud Data Pipelines", "Senior DevOps Engineer | Kubernetes & CI/CD Automation"). The tail must reflect what the experience bullets actually show—never JD keywords the history does not support. PREFER aligning the most recent 1–2 positions' cloud/platform/stack choices to the JD's, where the era rules allow it, so the JD-style title fits honestly. If the JD title names a vendor or platform (Azure, AWS, GCP, Salesforce…), keep that vendor word ONLY if the experience you generated actually features that platform prominently in the most recent positions; otherwise drop the vendor qualifier and use the neutral equivalent from the mapping above (e.g. JD "Azure DevOps Engineer" over an AWS-built history → "Senior DevOps Engineer", never a vendor title the history contradicts). firstJobTitle (the most recent position's own title) may differ from resumeTitle and must match what that position's bullets actually describe.

                        SECTION 3: LANGUAGE & STYLE

                        • US professional English. No citizenship/visa/nationality. Summary: bold key tech; no percentages.
                        • No AI-isms in ANY word form: spearhead(ed/ing), leverage(d/ing), robust, utilize(d/ing), seamless(ly), delve. Use plain verbs instead (used, built, led).
                        • No duty phrasing ("responsible for", "tasked with", "assisted with", "helped with")—every bullet is an achievement statement that leads with the action and lands on the result.
                        • No version numbers with technologies: write "PHP", "React", "Node.js" not "PHP 8", "React 18", "Node.js 20". Use technology names only.

                        SECTION 4: ATS (APPLICANT TRACKING SYSTEM)

                        GOAL: this resume must score at the TOP of ATS keyword matching against this specific JD, while every sentence still reads as natural human writing.
                        • Weave JD keywords naturally into summary and experience bullets so ATS can match requirements; do not stuff unnaturally.
                        • Use the JD's exact skill phrasing rather than synonyms—match scanners compare exact terms from the JD text. Vary bullet openings: do not start consecutive bullets with the same verb.
                        • Every era-allowed jdHardSkills item appears in at least one bullet; the JD's must-have skills each appear in bullets of at least TWO different era-eligible positions (scanners count frequency); spread them across different projects, never repeated phrasing. A skill forbidden by a position's era rule goes into OTHER positions' bullets, never that one's.
                        • Every jdSoftSkills item must appear at least once somewhere in the resume (summary or a bullet), expressed as a concrete action in the JD's own wording, never as a bare adjective or list item.
                        • Use standard job titles and skill names (no nicknames or obscure terms); prefer full names where widely recognized (e.g. "JavaScript", "TypeScript").
                        • Use standard, parseable action verbs: developed, implemented, led, designed, built, delivered, improved, integrated, optimized (avoid vague or flowery language).
                        • Keep generated text parseable: standard punctuation (hyphens, commas); no exotic Unicode or symbols in the resume content.

                        SECTION 5: SKILLS (DYNAMIC CATEGORIES)

                        Categories (from JD + role; not a fixed list):
                        • Include categories that cover all required skill areas in the JD (a required area may have one or more categories). Add others as relevant (e.g. Methodologies & Tools, Testing, Security, Data & ETL, AI/ML). Total: 5–9 categories.
                        • ONLY include a category when it has real, JD-relevant items. If a category would be empty, OMIT it entirely—NEVER write placeholder text like "None is relevant", "N/A", or "undefined" as an item.
                        • Use clear, standard labels: "Programming Languages", "Frontend", "Backend", "Database", "Cloud & DevOps", "AI/LLM/ML", "Methodologies & Tools", or "Security", "Testing", "Data & ETL" when the JD emphasizes them.

                        Format and counts:
                        • One string per category: "<Category Label>: skill1, skill2, ...". Aim for 10–15 items per category (exception below); every item from jdHardSkills must appear in exactly one category, listed first; then fill with jdRelatedSkills (adjacent tech a practitioner would also use), and only then from the baseline pool.
                        • Programming Languages (exception): lead with the role's MAIN language(s) from the JD, then add languages naturally related to that stack and role (the ecosystem a practitioner of this role actually uses—e.g. a Spark data role implies Python, SQL, Scala, Java, Bash; a React role implies JavaScript, TypeScript, HTML5, CSS3). NEVER pad with languages unrelated to the role (e.g. no C/C++ on a data-engineering resume unless the JD names them). Total: 5–8 items, never fewer than 5.
                        • Dedupe; no soft skills; plain text only (no markdown). Use exact or standard spellings from the JD and industry terms for ATS.
                        • Category items are technologies, tools, platforms, and methods ONLY—never communication or marketing channels (email, SMS, social media), benefits, or company slogans, unless the role itself is about building or operating those systems.
                        • Work products/deliverables the role produces (statements of work, work breakdown structures, staffing plans, status reports and similar documents) are NEVER skills items—demonstrate them inside experience bullets as concrete outputs instead ("authored statements of work for...").`
            },
            {
                role: "user",
                content:
                    `============================================
                    STEP 0 — EXTRACT FROM THE JOB DESCRIPTION
                    ============================================

                    (a) jdHardSkills: every required or strongly implied hard skill—languages, frameworks, tools, platforms, databases, cloud services—PLUS the multi-word capability and process phrases the JD's responsibilities and requirements sections repeat—PLUS, ALWAYS, the employer's industry/domain terms that the JD repeats—but only domain terms the candidate could credibly work WITH (the industry, its data types, its workflows), never the employer's marketing channels or slogans. 20–35 items. Use the JD's EXACT wording and spelling for each item (match scanners compare exact terms).
                    (b) jdSoftSkills: every soft skill, behavioral requirement, AND culture/working-style signal the JD emphasizes—both interpersonal skills (mentoring, communication, collaboration) and what kind of person/team they describe (passionate, organized, fast-paced, mission-driven, autonomous ownership). STRICT FORMAT: each item is 1–4 words. Split compound requirement sentences into separate short items (a sentence about passion, energy, and excitement for causes becomes "passion" + "mission-driven"). 5–12 items. Never copy full sentences.

                    (c) jdRelatedSkills: REQUIRED, 10–20 items, never empty. For the JD's core hard skills, list ADJACENT technologies and practices a real practitioner of this role would also use—complementary tools, underlying platforms, common pairings (e.g. a Spark requirement implies PySpark, Airflow, data partitioning; a React requirement implies Redux, Webpack, Jest). These must NOT appear in the JD's own text—they are what makes the resume richer than a JD echo.

                    SCOPE: extract (a) and (b) ONLY from the role's overview, responsibilities, requirements/qualifications, nice-to-haves, and company/culture description. NEVER extract from compensation, benefits, perks (insurance, 401(k), PTO, gym), location/remote policy, or equal-opportunity statements—those are not skills. Every item in (a) must be a real skill a candidate would list on a resume—never JD fluff or generic nouns (no "career path", "performance", "IT professionals").`
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

                    Baseline pool (reference):
${Object.entries(BASELINE_SKILLS).map(([cat, items]) => `${cat}: ${items.join(', ')}`).join('\n')}`
            },
            ...experiencePrompts,
            {
                role: "user",
                content:
                    `============================================
                    STEP 2 — SUMMARY
                    ============================================

                    Write 5–7 sentences (90–130 words) that make a recruiter screening for this JD see an immediate match.

                    Requirements:
                    • Open with the resume title's core role (the part before the " | " tail), plus the total experience: state EXACTLY "${totalYears}+ years"—this number is computed from the work history's actual dates; never invent a different figure.
                    • Weave 6–10 jdHardSkills items into the prose in bold (**), using the JD's exact terminology—cover the JD's core stack and domain, not a generic one.
                    • Name the JD's domain/product focus so the summary reads tailored to this role, not templated.
                    • Show 2–4 jdSoftSkills as demonstrated qualities, in the JD's own wording, woven into prose—covering both interpersonal skills and the JD's working-style/culture signals (e.g. thrives in fast-paced, mission-driven environments)—never as a list or a row of adjectives.
                    • Do NOT use or mention the profile name (e.g. avoid "Lavell Thompson is a..." or "[Name] has...").
                    • Write in third person without naming the person (e.g. "Senior Software Engineer with...", "Experienced in...").
                    • Do not mention specific projects; focus on experience summary only.
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
                       • Seniority only "Senior" or none (internship positions: "<Role> Intern" title instead)
                       • No language/framework in title (e.g. "Senior Full Stack Developer" not "Senior PHP Developer")
                       • JD title type (Developer/Engineer) respected
                       • Era-plausible per position: no AI/ML-flavored title on any position ending before 2019

                    2) Bullet Counts
                       ${bulletCountsChecklist}
                       • Add or trim bullets to match

                    3) Experience Bullets Content
                       • No company names (e.g. no "Creative Wave", "PixelPeak")
                       • No project codenames (e.g. no "Atlas", "Helios")
                       • Each position: at least one bullet visibly weaves a jdSoftSkills item as concrete behavior (not a listed skill)
                       • Soft-skill bullets match seniority: NO mentoring/leadership/team-ownership claims in Entry-level positions
                       • At least 2 bullets across the resume visibly reflect the JD's working-style/culture signals from jdSoftSkills (pace/autonomy/mission framing), and the summary reflects 2–4 jdSoftSkills—always as demonstrated behavior, never adjective lists
                       • No technology from a position's forbidden (STRICT era rule) list appears in its bullets
                       • No bullet claims a competitor's platform against its own employer (per each position's company context)
                       • If any violations above, rephrase to fix

                    4) Summary Content
                       • 5–7 sentences (90–130 words); opens with role identity + years of experience; JD's core hard skills bolded; 1–2 jdSoftSkills shown as demonstrated qualities
                       • Must not contain percentages, "percent", or "%"
                       • Remove or rephrase any such phrasing

                    5) Technology Formatting in Experience Bullets
                       • Every technology and skill name MUST be wrapped in ** (e.g. **Node.js**, **React**, **PostgreSQL**)
                       • Scan each bullet and bold any tech/skill that is still in plain text

                    6) Experience — Skills Per Position
                       • Each position: meets the distinct-skills count given in that position's Experience instruction (see STEP list above).
                       • If under the minimum, add relevant tech to existing bullets; keep each bullet's stack coherent (no mixing e.g. Python and Node.js in one bullet).

                    7) Experience — Coherent Stack Per Bullet
                       • In each bullet, only skills that fit that project
                       • Do not mix unrelated backend languages or stacks in one bullet; rephrase or split if needed

                    8) Skills Section (SECTION 5)
                       • Verify: 5–9 categories covering JD-required areas + role-relevant extras; 10–15 items per category (Programming Languages: 5–8 items—the JD's main language(s) plus role-related ecosystem languages, no unrelated padding, never fewer than 5).
                       • No compensation/benefits terms anywhere in skills (insurance, 401(k), PTO, and similar are never skills).
                       • Labels clear and standard; add or trim using baseline pool so categories are neither empty nor stuffed.
                       • Every jdHardSkills item appears in exactly one category, listed before baseline fillers—EXCEPT work products/deliverables (documents the role produces), which appear only in bullets as concrete outputs
                       • No jdSoftSkills item (or any soft skill) appears in the skills section—soft skills live only in bullet prose

                    9) ATS Compliance
                       • Every era-allowed jdHardSkills item appears BOLDED in at least one experience bullet across the positions (in addition to the Skills section); the summary carries 6–10 of them
                       • The JD's must-have skills each appear in bullets of at least two era-eligible positions; every jdSoftSkills item appears at least once (summary or bullet) as a concrete action
                       • JD keyword phrasing is exact (the JD's own terms), but sentences stay natural—never a bare keyword list, no two consecutive bullets starting with the same verb
                       • Job title and skills use standard spellings
                       • No exotic characters in generated text

                    10) Impact & Results
                       • Every bullet states a concrete outcome or impact (what improved, sped up, scaled, or got saved)—rephrase any bullet that only describes what was built
                       • Count each position's quantified bullets: EXACTLY the flagship number (2–3 per senior position, 1 for internships)—ADD a realistic figure to a strong bullet if under, remove digits from the weakest if over
                       • Figures realistic for the project's scale, company size, and era; absolute units preferred; a bare percentage at most once per position
                       • No repeated "improved X by N" template; no duty phrasing ("responsible for", "tasked with"); intern/entry outcomes stay junior-scale

                    11) Title Reconciliation
                       • resumeTitle is a headline: normalized JD role title FIRST, then " | " + a 2–4 word specialization tail the generated history actually supports—never a bare copy of the JD's title, never a tail the bullets contradict
                       • If resumeTitle names a vendor/platform, the recent positions' bullets actually feature that platform; otherwise resumeTitle uses the neutral role-type equivalent
                       • firstJobTitle matches what that position's own bullets describe (may differ from resumeTitle)

                    12) Company Grounding
                       • Where company context was supplied, that position's bullets live in the real domain described
                       • The company's name and product names appear NOWHERE in bullet text, summary, or skills—domain described generically

                    After applying all fixes, output the complete, corrected resume in the schema format.`
            }
            // source indentation is pure token cost — strip it before sending
        ].map(m => ({ ...m, content: m.content.replace(/\n[ \t]+/g, '\n') })),
        response_format: zodResponseFormat(generatedResumeExtracted, "resume_extraction"),
    });

    const resumeData = JSON.parse(completion.choices[0].message.content);
    console.log('Generated resume data (parsed)');

    JOB_FIELD_NAMES.forEach((field) => {
        const titleKey = `${field}Title`;
        if (resumeData[titleKey] != null) {
            resumeData[field] = resumeData[titleKey];
        }
    });

    return resumeData;
}

// Second-pass reviewer: a fresh set of eyes over the drafted skills section, catching junk the
// deterministic guards cannot enumerate (JD fluff like "career path", "performance", "IT professionals").
// Items it removes are also pruned from jdHardSkills so the backfill/coverage machinery never re-adds them.
// Degrades to the unreviewed skills on any error — the review must never block generation.
async function reviewSkillsSection(resumeData) {
    if (!Array.isArray(resumeData.skills) || resumeData.skills.length === 0) return;
    try {
        const completion = await openai.chat.completions.create({
            model: MODEL,
            temperature: 0,
            messages: [{
                role: 'system',
                content: 'You review the SKILLS section of a tech resume with fresh eyes. Each line is "Category: item, item, ...". List ONLY the items that clearly do NOT belong in a skills section: JD fluff and generic nouns ("career path", "performance", "IT professionals"), job titles, work products/documents ("statements of work"), benefits, marketing phrases, and sentence fragments. Real skills stay: technologies, tools, platforms, frameworks, databases, cloud services, AND named practices/methodologies (data modeling, code review, system design, CI/CD, ETL pipelines, unit testing are all skills). WHEN UNSURE, DO NOT LIST IT. Return the exact item texts to remove; return an empty list if everything belongs.'
            }, {
                role: 'user',
                content: resumeData.skills.join('\n')
            }],
            response_format: zodResponseFormat(z.object({ remove: z.array(z.string()) }), 'skills_review'),
        });
        const removeSet = new Set(
            (JSON.parse(completion.choices[0].message.content).remove || []).map(s => String(s).trim().toLowerCase())
        );
        if (removeSet.size === 0) return;

        // paranoia guard: a reviewer wanting to gut the section is wrong — keep the draft
        const totalItems = resumeData.skills.reduce((n, l) => n + (parseSkillLine(l).items || '').split(',').filter(s => s.trim()).length, 0);
        if (removeSet.size > totalItems / 2) {
            console.warn(`Skills review skipped: wanted to remove ${removeSet.size}/${totalItems} items (implausible)`);
            return;
        }

        // apply the surgery deterministically — no line rewriting by the model
        resumeData.skills = resumeData.skills.map((line) => {
            const { category, items } = parseSkillLine(line);
            if (!items) return line;
            const kept = items.split(',').map(s => s.trim()).filter(Boolean).filter((item) => {
                if (removeSet.has(item.toLowerCase())) {
                    console.warn(`Skills review removed: "${item}" from "${category}"`);
                    return false;
                }
                return true;
            });
            return `${category}: ${kept.join(', ')}`;
        }).filter((line) => parseSkillLine(line).items !== '');

        // prune the same items from jdHardSkills so backfill/coverage never resurrect them
        if (Array.isArray(resumeData.jdHardSkills)) {
            resumeData.jdHardSkills = resumeData.jdHardSkills.filter(s => !removeSet.has(String(s).trim().toLowerCase()));
        }
    } catch (e) {
        console.warn(`Skills review pass skipped (${e.message}) — keeping unreviewed skills`);
    }
}

// Headline backstop: the prompt asks for "Core Role | Specialization Tail" but the model sometimes
// returns the bare role. Build the tail from the top two JD hard skills that actually appear in the
// most recent position's bullets — grounded in the history, so it never claims what the resume doesn't show.
// ponytail: first-two-in-extraction-order pick; upgrade to frequency ranking only if tails read poorly.
function ensureTitleTail(resumeData) {
    const title = String(resumeData.resumeTitle || '');
    if (!title || title.includes('|')) return;
    const recentBullets = (resumeData.firstJobBullets || []).join(' ').toLowerCase();
    const picks = (resumeData.jdHardSkills || [])
        .filter(s => String(s).length <= 28 && !WORK_PRODUCT_RE.test(s) && recentBullets.includes(String(s).toLowerCase()))
        .slice(0, 2)
        .map(s => String(s).replace(/\b[a-z]/g, c => c.toUpperCase()));
    if (picks.length === 0) return;
    resumeData.resumeTitle = `${title} | ${picks.join(' & ')}`;
    console.warn(`Title tail added: "${resumeData.resumeTitle}"`);
}

// ==========================================================================
// POST-PROCESSING PIPELINE & ORCHESTRATION
// ==========================================================================
// Deterministic post-LLM pipeline, in dependency order:
// scrubbers first (so filters and coverage checks see clean text), then coverage backfill,
// then warn-only visibility checks (they must observe the final state).
async function postProcessResumeData(resumeData, companies, jobDescription, internFlags = []) {
    stripVersionNumbersFromResume(resumeData);   // "React 18" → "React"
    stripAiIsmsFromResume(resumeData);           // leveraged/robust/seamless → plain verbs
    stripNonSkillTerms(resumeData);              // benefits & bare channel words out of extraction lists
    filterIrrelevantLanguages(resumeData, jobDescription); // language padding out (floor of 5 kept)
    fillSkillCoverage(resumeData);               // missing jdHardSkills appended to a skills category
    scrubSkillItems(resumeData);                 // non-skill items out of final category lines
    await reviewSkillsSection(resumeData);       // fresh-eyes LLM review of the final skills draft
    ensureTitleTail(resumeData);                 // "Core Role | Specialization" headline guaranteed
    fixExperienceYears(resumeData, companies, internFlags); // summary's years = professional (non-intern) history only

    warnTemporalViolations(resumeData, companies);
    warnVendorConflicts(resumeData, companies);
    warnCoverageGaps(resumeData, companies);
    warnImpactBalance(resumeData);

    // Last-resort safety: strip percent forms from summary without heavy rewriting
    if (containsPercentageLike(resumeData.summary)) {
        resumeData.summary = String(resumeData.summary || '')
            .replace(/%/g, '')
            .replace(/\bpercentages?\b/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
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

        // TEMPLATE FIRST: static Intern labels and printed date ranges in the docx override DB values,
        // and only positions the template can actually render are generated or counted
        const templateBuffer = fs.readFileSync(templatePath); // read once; signals + export share it
        const templateSignals = extractTemplateSignals(templateBuffer);

        // Ensure we have at least 2 companies, up to 6 — capped at the template's block count
        const numCompanies = renderableCompanyCount(
            templateSignals,
            Math.min(Math.max(candidateInfo.companies.length, 2), MAX_COMPANIES)
        );
        candidateInfo.companies = candidateInfo.companies.slice(0, numCompanies);
        candidateInfo.companies = candidateInfo.companies.map((c, i) =>
            templateSignals[i] && templateSignals[i].period ? { ...c, period: templateSignals[i].period } : c
        );
        const internFlags = candidateInfo.companies.map((c, i) => !!(templateSignals[i] && templateSignals[i].isIntern));

        // profileName = Name of Template (from DB), used for generated filename only
        const templateProfileName = profileName && String(profileName).trim() ? String(profileName).trim() : null;

        // Build dynamic schema based on number of companies
        const jobFieldNames = JOB_FIELD_NAMES.slice(0, numCompanies);

        // Field order matters: OpenAI structured outputs generate properties in schema order.
        // Extraction first (forces JD enumeration before writing), then experience, then skills/summary
        // (drawn from the written history), then resumeTitle last (drawn from everything above).
        const schemaFields = {
            jdHardSkills: z.array(z.string()),
            jdSoftSkills: z.array(z.string()),
            jdRelatedSkills: z.array(z.string()),
        };

        // Add job title and bullet fields only for the companies we're generating (2–6)
        jobFieldNames.forEach(field => {
            schemaFields[`${field}Title`] = z.string();
            schemaFields[`${field}Bullets`] = getExperienceFieldSchema(field);
        });

        schemaFields.skills = z.array(z.string());
        schemaFields.summary = z.string();
        schemaFields.resumeTitle = z.string();

        const generatedResumeExtracted = z.object(schemaFields);

        // Ground each position in the company's real domain (never rejects; '' on any failure)
        const research = await Promise.all(candidateInfo.companies.map(c => researchCompany(c.name)));

        // Single completion: generate and polish resume content in one pass (experience prompts built inside runResumeCompletion)
        const resumeData = await runResumeCompletion(
            jobDescription,
            candidateInfo,
            numCompanies,
            generatedResumeExtracted,
            research,
            internFlags
        );

        await postProcessResumeData(resumeData, candidateInfo.companies, jobDescription, internFlags);

        // Generate the DOCX document
        const buffer = await exportResume(resumeData, templateBuffer);

        // Filename: Template profileName (Name of Template) when available, else 'resume'
        const nameForFile = (templateProfileName || 'resume') + (companyName ? '_' + companyName : '');
        const sanitizedName = nameForFile.replace(/[<>:"/\\|?*]/g, '-').trim();
        const randomTwoDigits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        const filename = `${sanitizedName}_${randomTwoDigits}.docx`;

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

// ==========================================================================
// DOCX RENDERING (segments, XML fixers, export)
// ==========================================================================
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
    return skillsArray.map((line, index) => {
        const { category, items } = parseSkillLine(line);
        const segments = [
            ...(index > 0 ? [{ bold: '', plain: '\n\n' }] : []),
            { bold: category, plain: '' },
            { bold: '', plain: (items ? ': ' + items : '') }
        ];
        return { bullet: segments };
    });
}

// Word splits template tags across styled runs ("{" + bold("bold") + "}"), so the {bold}/{plain} slots
// can render with the wrong styling. Force it after render: the run holding a category name gets bold,
// the run holding its ": items" text loses bold. Matches exact generated strings, so nothing else is touched.
// ponytail: regex over document.xml; extend to bullet tech-name runs only if a template ever mis-styles those too.
function forceSkillsCategoryStyling(xml, skillsArray) {
    if (!Array.isArray(skillsArray)) return xml;
    const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    skillsArray.forEach((line) => {
        const { category, items } = parseSkillLine(line);
        if (!category) return;
        const cat = escapeRegex(escXml(category));
        // category run without rPr → insert bold
        xml = xml.replace(
            new RegExp(`(<w:r(?:\\s[^>]*)?>)(<w:t(?:\\s[^>]*)?>${cat}</w:t>)`, 'g'),
            '$1<w:rPr><w:b/><w:bCs/></w:rPr>$2'
        );
        // category run with rPr lacking bold → add bold into it
        xml = xml.replace(
            new RegExp(`(<w:r(?:\\s[^>]*)?><w:rPr>)((?:(?!<w:b/>)(?!</w:rPr>).)*</w:rPr><w:t(?:\\s[^>]*)?>${cat}</w:t>)`, 'g'),
            '$1<w:b/><w:bCs/>$2'
        );
        // items run → strip bold if present
        if (items) {
            const it = escapeRegex(escXml(': ' + items));
            xml = xml.replace(
                new RegExp(`<w:r((?:\\s[^>]*)?)><w:rPr>((?:(?!</w:rPr>).)*)</w:rPr>(<w:t(?:\\s[^>]*)?>${it}</w:t>)`, 'g'),
                (m, attrs, rpr, t) => `<w:r${attrs}><w:rPr>${rpr.replace(/<w:b\/>|<w:bCs\/>/g, '')}</w:rPr>${t}`
            );
        }
    });
    return xml;
}

// ATS parsers read visible text, not hyperlink targets. If a linkedin.com hyperlink displays a label
// ("LinkedIn") instead of the URL, replace the display text with the actual URL from the rels file.
// ponytail: linkedin-only on purpose; generalize to all hyperlinks only if another link type gets flagged.
function fixLinkedinDisplayText(documentXml, relsXml) {
    if (!relsXml) return documentXml;
    const relTags = (relsXml.match(/<Relationship\b[^>]*>/g) || []).filter((t) => /linkedin\.com/i.test(t));
    relTags.forEach((tag) => {
        const rId = (tag.match(/ Id="([^"]+)"/) || [])[1];
        const target = (tag.match(/ Target="([^"]+)"/) || [])[1];
        if (!rId || !target) return;
        const display = target.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
            .replace(/&(?!amp;)/g, '&amp;').replace(/</g, '&lt;');
        const hlRe = new RegExp(`(<w:hyperlink[^>]*r:id="${rId}"[^>]*>)([\\s\\S]*?)(</w:hyperlink>)`, 'g');
        documentXml = documentXml.replace(hlRe, (whole, open, inner, close) => {
            const visible = inner.replace(/<[^>]+>/g, '');
            if (/linkedin\.com/i.test(visible)) return whole; // already shows the URL
            let replaced = false;
            const newInner = inner.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g, (tm, o, c) => {
                const out = replaced ? o + c : o + display + c;
                replaced = true;
                return out;
            });
            return open + newInner + close;
        });
    });
    return documentXml;
}

const exportResume = async (resume, template) => {
    try {
        const content = Buffer.isBuffer(template) ? template : fs.readFileSync(template);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            // ponytail: nullGetter blanks unmatched tags (fewer companies than template blocks rendered
            // literal "undefined"); revisit only if a template needs visible defaults.
            nullGetter: () => ''
        });

        // Skills: same format as experience bullets so template can use {#skills}{#bullet}{bold}{plain}{/bullet}{/skills}
        const skillsForTemplate = formatSkillsLikeBullets(resume.skills);

        // Build options dynamically based on what exists in resume data
        const options = {
            summary: resume.summary ? resume.summary.replace(/\*/g, '') : '',
            skills: skillsForTemplate,
        };

        // RENDER CONTRACT: {firstJob}..{sixthJob} title strings and {bullets1}..{bullets6}
        // segment arrays; keys for absent companies stay ABSENT, never empty.
        JOB_FIELD_NAMES.forEach((field, i) => {
            if (resume[field]) options[field] = resume[field];
            const bullets = resume[`${field}Bullets`];
            if (Array.isArray(bullets) && bullets.length > 0) {
                options[`bullets${i + 1}`] = formatBullets(bullets);
            }
        });

        if (resume.resumeTitle || resume.firstJob) {
            options['title'] = resume.resumeTitle || resume.firstJob;
        }

        doc.render(options);

        const outZip = doc.getZip();
        let renderedXml = outZip.file('word/document.xml').asText();
        renderedXml = forceSkillsCategoryStyling(renderedXml, resume.skills);
        const relsFile = outZip.file('word/_rels/document.xml.rels');
        renderedXml = fixLinkedinDisplayText(renderedXml, relsFile ? relsFile.asText() : null);
        outZip.file('word/document.xml', renderedXml);

        const buf = outZip.generate({
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

// ==========================================================================
// SELF-CHECK — OPENAI_API_KEY=dummy node backend/services/resumeGenerator.js
// ==========================================================================
if (require.main === module) {
    const assert = require('assert');

    // parsePeriodYears
    assert.deepStrictEqual(parsePeriodYears('06/2019 - 12/2021'), { startYear: 2019, endYear: 2021 });
    assert.ok(parsePeriodYears('01/2022 - Present').endYear >= 2025);
    assert.strictEqual(parsePeriodYears('not a period'), null);

    // getForbiddenTechForEndYear
    assert.ok(getForbiddenTechForEndYear(2017).includes('LangChain'));
    assert.ok(!getForbiddenTechForEndYear(2017).includes('Docker'));

    // warnTemporalViolations: flags planted violation, ignores era-legal tech
    {
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (msg) => warnings.push(msg);
        warnTemporalViolations(
            { firstJobBullets: ['Built a service using **LangChain** and **Docker**.'], firstJobTitle: 'AI Engineer' },
            [{ period: '01/2015 - 12/2017' }]
        );
        console.warn = originalWarn;
        assert.ok(warnings.some(w => w.includes('LangChain')));
        assert.ok(!warnings.some(w => w.includes('Docker')));
        assert.ok(warnings.some(w => w.includes('AI/ML-era title')));
    }

    // formatSkillsLikeBullets: no leading separator on first category, present on second
    {
        const formatted = formatSkillsLikeBullets(['**A**: x', 'B: y']);
        assert.strictEqual(formatted[0].bullet[0].bold, 'A');
        assert.strictEqual(formatted[0].bullet[0].plain, '');
        assert.strictEqual(formatted[1].bullet[0].plain, '\n\n');
        assert.deepStrictEqual(Object.keys(formatted[0].bullet[0]).sort(), ['bold', 'plain']);
    }

    // fillSkillCoverage: fills missing, skips present
    {
        const resumeData = {
            jdHardSkills: ['ClickHouse', 'React'],
            skills: ['Frontend: React, Vue', 'Methodologies & Tools: Git, Jira'],
            firstJobBullets: ['Built dashboards with **React**.']
        };
        fillSkillCoverage(resumeData);
        assert.ok(resumeData.skills[1].includes('ClickHouse'));
        assert.strictEqual((resumeData.skills[0].match(/React/g) || []).length, 1);
    }

    // warnCoverageGaps: flags missing skills, tolerates inflections, exempts era-forbidden tech
    {
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (msg) => warnings.push(msg);
        warnCoverageGaps(
            {
                jdHardSkills: ['Kafka', 'LangChain'],       // Kafka absent → warn; LangChain era-forbidden → exempt
                jdSoftSkills: ['mentoring', 'collaboration'], // "mentored" inflection → no warn; collaboration absent → warn
                summary: 'Mentored engineers across teams.',
                firstJobBullets: ['Built **Docker** services.']
            },
            [{ period: '01/2015 - 12/2017' }]
        );
        console.warn = originalWarn;
        assert.ok(warnings.some(w => w.includes('"Kafka"')));
        assert.ok(!warnings.some(w => w.includes('"LangChain"')));
        assert.ok(!warnings.some(w => w.includes('"mentoring"')));
        assert.ok(warnings.some(w => w.includes('"collaboration"')));
    }

    // warnVendorConflicts: rival platform at its vendor's employer warns, own platform doesn't
    {
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (msg) => warnings.push(msg);
        warnVendorConflicts(
            {
                firstJobBullets: ['Implemented **Azure** cloud solutions for enterprise clients.', 'Scaled **AWS** infrastructure to 2M requests daily.'],
                secondJobBullets: ['Deployed **AWS Lambda** workflows for retail analytics.']
            },
            [{ name: 'Amazon Web Services', period: '07/2016 - 08/2020' }, { name: 'Shopify', period: '01/2014 - 06/2016' }]
        );
        console.warn = originalWarn;
        assert.ok(warnings.some(w => w.includes('Azure') && w.includes('firstJob')));
        assert.ok(!warnings.some(w => w.includes('AWS')));
        assert.strictEqual(warnings.length, 1);
    }

    // ensureTitleTail: builds a history-grounded tail when missing, leaves compliant titles alone
    {
        const originalWarn = console.warn;
        console.warn = () => {};
        const bare = {
            resumeTitle: 'Senior Data Engineer',
            jdHardSkills: ['Apache Spark', 'statements of work', 'data pipelines', 'Kafka'],
            firstJobBullets: ['Built **Apache Spark** jobs feeding data pipelines at 2TB daily scale.']
        };
        ensureTitleTail(bare);
        assert.strictEqual(bare.resumeTitle, 'Senior Data Engineer | Apache Spark & Data Pipelines');

        const compliant = { resumeTitle: 'Senior DevOps Engineer | Kubernetes & CI/CD', jdHardSkills: ['AWS'], firstJobBullets: ['**AWS** work.'] };
        ensureTitleTail(compliant);
        assert.strictEqual(compliant.resumeTitle, 'Senior DevOps Engineer | Kubernetes & CI/CD');

        const noEvidence = { resumeTitle: 'Senior Engineer', jdHardSkills: ['Kafka'], firstJobBullets: ['Built dashboards.'] };
        ensureTitleTail(noEvidence);
        assert.strictEqual(noEvidence.resumeTitle, 'Senior Engineer');
        console.warn = originalWarn;
    }

    // warnImpactBalance: flags zero metrics AND metric stuffing; tech digits (HTML5, OAuth 2.0) ≠ metrics
    {
        const warnings = [];
        const originalWarn = console.warn;
        console.warn = (msg) => warnings.push(msg);
        const metricBullet = (i) => `Cut latency from ${900 + i}ms to 210ms on **Redis**.`;
        warnImpactBalance({
            // 6 bullets, 5 quantified → stuffed (target 2)
            firstJobBullets: [metricBullet(1), metricBullet(2), metricBullet(3), metricBullet(4), metricBullet(5), 'Improved reliability of partner APIs.'],
            // 0 quantified → warn
            secondJobBullets: ['Built dashboards with **HTML5** and **CSS3**.', 'Integrated **OAuth 2.0** flows for partner APIs.'],
            // 1 quantified of 2 → balanced, silent; but 2 bare % → percent warn
            thirdJobBullets: ['Raised coverage by 40% and cut failures by 30%.', 'Improved build times by 25% quarter over quarter.']
        });
        console.warn = originalWarn;
        assert.ok(warnings.some(w => w.includes('firstJob') && w.includes('metric-stuffed')));
        assert.ok(warnings.some(w => w.includes('secondJob has 0/2') && w.includes('below flagship target')));
        assert.ok(warnings.some(w => w.includes('thirdJob') && w.includes('%')));
    }

    // renderableCompanyCount: positions without a template block are dropped; degraded cases keep the request
    {
        const sig = { isIntern: false, period: null };
        assert.strictEqual(renderableCompanyCount([sig, sig, sig, null], 4), 3); // 3-block template, 4 companies
        assert.strictEqual(renderableCompanyCount([sig, sig, null, null], 4), 2);
        assert.strictEqual(renderableCompanyCount([sig, sig, sig, sig], 3), 3);  // fewer companies than blocks
        assert.strictEqual(renderableCompanyCount([], 4), 4);                    // unreadable template → unchanged
        assert.strictEqual(renderableCompanyCount([sig, null, null, null], 4), 4); // <2 blocks → keep the floor
    }

    // totalExperienceYears + fixExperienceYears: professional (non-intern) durations only
    {
        const companies = [
            { period: '08/2020 - Present' },   // ~5.9y as of 2026
            { period: '07/2016 - 08/2020' },   // ~4.1y
            { period: '01/2014 - 01/2016' }    // 2y internship — must NOT count
        ];
        const withIntern = totalExperienceYears(companies);
        const professional = totalExperienceYears(companies, [false, false, true]);
        assert.strictEqual(withIntern - professional, 2);
        assert.ok(professional >= 9 && professional <= 11, `unexpected total: ${professional}`);

        // title-based intern detection excludes the internship even without explicit flags
        const resumeData = {
            summary: 'Senior Data Engineer with over 7 years of experience building pipelines.',
            thirdJobTitle: 'Software Engineering Intern'
        };
        const originalWarn = console.warn;
        console.warn = () => {};
        fixExperienceYears(resumeData, companies);
        console.warn = originalWarn;
        assert.ok(resumeData.summary.includes(`${professional}+ years`), resumeData.summary);
        assert.ok(!resumeData.summary.includes('over 7 years'));
        // idempotent: correct value stays untouched
        const before = resumeData.summary;
        fixExperienceYears(resumeData, companies);
        assert.strictEqual(resumeData.summary, before);
    }

    // filterIrrelevantLanguages: unjustified padding dropped only beyond the 5-language floor
    {
        const originalWarn = console.warn;
        console.warn = () => {};

        // 5 justified + 1 padding → padding dropped
        const resumeData = {
            skills: ['Programming Languages: Python, SQL, Scala, Java, Bash, PHP'],
            summary: 'Data engineer building **Python** and **Scala** pipelines with **Bash** tooling.',
            firstJobBullets: ['Optimized **Java** services processing 2M records daily.']
        };
        filterIrrelevantLanguages(resumeData, 'Requirements: Python, SQL, Apache Spark.');
        assert.strictEqual(resumeData.skills[0], 'Programming Languages: Python, SQL, Scala, Java, Bash');

        // only 1 justified but list is at/below the floor → nothing dropped
        const small = {
            skills: ['Programming Languages: Python, SQL, C#'],
            summary: 'Builds **Python** pipelines.',
            firstJobBullets: []
        };
        filterIrrelevantLanguages(small, 'Requirements: Python.');
        assert.strictEqual(small.skills[0], 'Programming Languages: Python, SQL, C#');

        console.warn = originalWarn;
    }

    // stripNonSkillTerms: benefits AND bare channel words leak out, real/compound skills stay
    {
        const resumeData = {
            jdHardSkills: ['Apache Spark', '401(k) plan', 'medical plan', 'stock options', 'email', 'email marketing automation', 'SMS'],
            jdSoftSkills: ['mentoring', 'paid time off']
        };
        const originalWarn = console.warn;
        console.warn = () => {};
        stripNonSkillTerms(resumeData);
        console.warn = originalWarn;
        assert.deepStrictEqual(resumeData.jdHardSkills, ['Apache Spark', 'email marketing automation']);
        assert.deepStrictEqual(resumeData.jdSoftSkills, ['mentoring']);
    }

    // scrubSkillItems: non-skill items AND work products removed from category lines, empty categories dropped
    {
        const resumeData = {
            skills: [
                'Methodologies & Tools: Git, email, statements of work, work breakdown structures, Jira, staff plans',
                'Channels: email, SMS'
            ]
        };
        const originalWarn = console.warn;
        console.warn = () => {};
        scrubSkillItems(resumeData);
        console.warn = originalWarn;
        assert.deepStrictEqual(resumeData.skills, ['Methodologies & Tools: Git, Jira']);
    }

    // scrubSkillItems: placeholder items ("None is relevant...", "undefined", "N/A") dropped, emptied categories removed
    {
        const resumeData = {
            skills: [
                'Testing: None is relevant for this skill',
                'Security: undefined',
                'Data & ETL: N/A, Airflow',
                'Frontend: React'
            ]
        };
        const originalWarn = console.warn;
        console.warn = () => {};
        scrubSkillItems(resumeData);
        console.warn = originalWarn;
        assert.deepStrictEqual(resumeData.skills, ['Data & ETL: Airflow', 'Frontend: React']);
    }

    // fillSkillCoverage: work products never backfilled into skills, still tracked for bullets
    {
        const resumeData = {
            jdHardSkills: ['statements of work', 'level of effort', 'Kafka'],
            skills: ['Methodologies & Tools: Git'],
            firstJobBullets: ['Authored statements of work for client engagements.']
        };
        const originalWarn = console.warn;
        console.warn = () => {};
        fillSkillCoverage(resumeData);
        console.warn = originalWarn;
        assert.ok(resumeData.skills[0].includes('Kafka'));
        assert.ok(!/statements of work|level of effort/i.test(resumeData.skills[0]));

        // warnCoverageGaps still flags a work product missing from all bullets
        const warnings = [];
        const orig2 = console.warn;
        console.warn = (msg) => warnings.push(msg);
        warnCoverageGaps(resumeData, [{ period: '01/2022 - Present' }]);
        console.warn = orig2;
        assert.ok(!warnings.some(w => w.includes('statements of work'))); // present in a bullet
        assert.ok(warnings.some(w => w.includes('level of effort')));     // absent → warned
    }

    // forceSkillsCategoryStyling: category run gains bold, items run loses bold, other runs untouched
    {
        const xml = '<w:r w:rsidRPr="A"><w:t xml:space="preserve">Frontend</w:t></w:r>' +
            '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">: React, Vue</w:t></w:r>' +
            '<w:r><w:t>Other text</w:t></w:r>';
        const out = forceSkillsCategoryStyling(xml, ['Frontend: React, Vue']);
        assert.ok(out.includes('<w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Frontend</w:t>'));
        assert.ok(out.includes('<w:rPr></w:rPr><w:t xml:space="preserve">: React, Vue</w:t>'));
        assert.ok(out.includes('<w:r><w:t>Other text</w:t></w:r>'));
    }

    // fixLinkedinDisplayText: label replaced with URL, URL-displaying links untouched
    {
        const rels = '<Relationship Id="rId7" Type="http://x/hyperlink" Target="https://www.linkedin.com/in/jane-doe/" TargetMode="External"/>';
        const xml = '<w:hyperlink r:id="rId7" w:history="1"><w:r><w:t>LinkedIn</w:t></w:r></w:hyperlink>';
        const out = fixLinkedinDisplayText(xml, rels);
        assert.ok(out.includes('<w:t>linkedin.com/in/jane-doe</w:t>'));
        const already = '<w:hyperlink r:id="rId7"><w:r><w:t>linkedin.com/in/jane-doe</w:t></w:r></w:hyperlink>';
        assert.strictEqual(fixLinkedinDisplayText(already, rels), already);
        assert.strictEqual(fixLinkedinDisplayText(xml, null), xml);
    }

    // fillSkillCoverage: misfiled soft skills never reach the skills section
    {
        const resumeData = {
            jdHardSkills: ['mentoring', 'technical decision making', 'Kafka'],
            jdSoftSkills: ['mentoring'],
            skills: ['Methodologies & Tools: Git'],
            firstJobBullets: []
        };
        fillSkillCoverage(resumeData);
        assert.ok(resumeData.skills[0].includes('Kafka'));
        assert.ok(!resumeData.skills[0].includes('mentoring'));
        assert.ok(!resumeData.skills[0].includes('decision making'));
    }

    // fillSkillCoverage: non-word-char skills (C#, C++) detected as present, not duplicated
    {
        const resumeData = {
            jdHardSkills: ['C#', 'C++'],
            skills: ['Programming Languages: C#, C++, Python'],
            firstJobBullets: []
        };
        fillSkillCoverage(resumeData);
        assert.strictEqual((resumeData.skills[0].match(/C#/g) || []).length, 1);
        assert.strictEqual((resumeData.skills[0].match(/C\+\+/g) || []).length, 1);
    }

    // extractTemplateSignals: template-first Intern labels + printed dates.
    // Uses a synthetic docx (real templates are user-owned and may not exist on disk).
    // Run concatenation ("InternAcmeJul 2019") and both date formats are covered.
    {
        const zip = new PizZip();
        zip.file('word/document.xml',
            '<w:document><w:p><w:r><w:t>Software Engineering Intern</w:t></w:r>' +
            '<w:r><w:t>AcmeJul 2019 – Present</w:t></w:r><w:r><w:t>{#bullets1}</w:t></w:r>' +
            '<w:r><w:t>{/bullets1}</w:t></w:r><w:r><w:t>Staff Engineer | ACME | 09/2016 - 03/2018</w:t></w:r>' +
            '<w:r><w:t>{#bullets2}</w:t></w:r><w:r><w:t>{/bullets2}</w:t></w:r></w:p></w:document>');
        const tmpDocx = path.join(require('os').tmpdir(), 'resumeGenerator-selfcheck.docx');
        fs.writeFileSync(tmpDocx, zip.generate({ type: 'nodebuffer' }));
        const signals = extractTemplateSignals(tmpDocx);
        fs.unlinkSync(tmpDocx);
        assert.strictEqual(signals[0].isIntern, true);
        assert.strictEqual(signals[0].period, '07/2019 - Present');
        assert.strictEqual(signals[1].isIntern, false);
        assert.strictEqual(signals[1].period, '09/2016 - 03/2018');
        assert.strictEqual(signals[2], null);
        assert.deepStrictEqual(extractTemplateSignals('/nonexistent.docx'), []);
    }

    // stripAiIsms: all banned word forms swapped, capitalization preserved
    assert.strictEqual(
        stripAiIsms('Spearheaded a robust rollout, utilizing tools seamlessly while leveraging APIs.'),
        'Led a reliable rollout, using tools smoothly while using APIs.'
    );

    // getExperienceFieldSchema: firstJob accepts 10, rejects 9
    assert.ok(getExperienceFieldSchema('firstJob').safeParse(Array(10).fill('bullet')).success);
    assert.ok(!getExperienceFieldSchema('firstJob').safeParse(Array(9).fill('bullet')).success);

    console.log('resumeGenerator self-check OK');
}

module.exports = {
    generateResume
};
