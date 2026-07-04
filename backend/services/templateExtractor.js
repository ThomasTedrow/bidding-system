const OpenAI = require('openai');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');
const PizZip = require('pizzip');
const fs = require('fs');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract text content from DOCX file
 */
function extractTextFromDocx(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'binary');
        const zip = new PizZip(content);

        // Check if document.xml exists
        const documentFile = zip.files['word/document.xml'];
        if (!documentFile) {
            throw new Error('Document.xml not found in DOCX file');
        }

        // Get the document content
        const xml = documentFile.asText();

        // Extract text from XML (simple extraction - remove XML tags)
        // This is a basic extraction; for more complex templates, consider using mammoth or similar
        let text = xml
            .replace(/<[^>]+>/g, ' ') // Remove XML tags
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        return text;
    } catch (error) {
        console.error('Error extracting text from DOCX:', error);
        throw new Error('Failed to extract text from template file: ' + error.message);
    }
}

/**
 * Extract company info from template file using OpenAI
 */
const extractCompanyInfoFromTemplate = async (templatePath) => {
    try {
        console.log('Extracting company info from template:', templatePath);

        // Extract text from DOCX
        const templateText = extractTextFromDocx(templatePath);

        // Define schema for company info extraction - companies array ordered from most recent to oldest
        const companyInfoSchema = z.object({
            companies: z.array(z.object({
                name: z.string(),
                period: z.string()
            })).min(2).max(4).nullable().optional()
        });

        // Call OpenAI to extract company info
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        `You are an expert at extracting structured information from resume templates. Extract company information and employment periods from the template text. 
                    
                        If company names or periods are not found in the template, return null for those fields.
                        Return only the fields that are actually present in the template.`
                },
                {
                    role: "user",
                    content:
                        `Extract company information from this resume template:

                        ${templateText.substring(0, 4000)}${templateText.length > 4000 ? '...' : ''}

                        Look for:
                        - Company names and employment periods (extract as an array of objects with 'name' and 'period' fields)
                        - Companies should be ordered from most recent to oldest
                        - Extract 2-4 companies maximum

                        Format periods as "MM/YYYY - MM/YYYY" or "MM/YYYY - Present" if applicable.
                        Return companies as an array: [{name: "Company1", period: "01/2022 - Present"}, {name: "Company2", period: "06/2019 - 12/2021"}, ...]
                        If information is not found, return empty array or null.`
                }
            ],
            response_format: zodResponseFormat(companyInfoSchema, "company_info_extraction"),
        });

        const extractedInfo = JSON.parse(completion.choices[0].message.content);

        // Ensure companies array exists and is valid (2-4 companies)
        if (!extractedInfo.companies || !Array.isArray(extractedInfo.companies)) {
            extractedInfo.companies = [];
        }

        // Limit to 2-4 companies
        extractedInfo.companies = extractedInfo.companies.slice(0, 4);
        if (extractedInfo.companies.length < 2) {
            // If less than 2 companies, return null to use defaults
            return null;
        }

        console.log('Extracted company info:', extractedInfo);
        return extractedInfo;

    } catch (error) {
        console.error('Error extracting company info from template:', error);
        // Return null if extraction fails - will use defaults
        return null;
    }
};

module.exports = {
    extractCompanyInfoFromTemplate,
    extractTextFromDocx
};
