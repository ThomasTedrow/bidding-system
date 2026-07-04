# Resume Generator Backend

Express.js API server for AI-powered resume generation.

## Installation

```bash
npm install
cp .env.example .env
```

Edit `.env` and add your OpenAI API key.

## Running

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `PORT` - Server port (default: 3001)

## API Endpoints

### POST /api/generate-resume

Generate a customized resume from job description.

**Request:** multipart/form-data
- `jobDescription` (string) - Job posting text
- `companyInfo` (JSON string) - User's work history
- `template` (file) - .docx template file

**Response:** Binary .docx file

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Resume Generator API is running"
}
```
