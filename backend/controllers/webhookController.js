/**
 * Webhook handlers (public endpoints)
 */

const axios = require('axios');

const Job = require('../models/Job');
const { LEGION_VALUES } = require('../constants');
const { getExcludedCompanyMatcher } = require('../utils/companyExclusion');

const webhookJobs = async (req, res) => {
  try {
    const payload = req.body;

    const isEmptyObject =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      Object.keys(payload).length === 0;
    const isEmptyArray = Array.isArray(payload) && payload.length === 0;

    if (payload == null || isEmptyObject || isEmptyArray) {
      return res.status(200).json({
        success: false,
        error: 'Empty payload',
        message: 'Expected a non-empty JSON body.',
      });
    }

    const apifyToken = process.env.APIFY_API_KEY;
    if (!apifyToken || typeof apifyToken !== 'string' || apifyToken.trim().length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Missing APIFY_API_KEY',
        message: 'Set APIFY_API_KEY in backend environment variables.',
      });
    }

    const defaultDatasetId = payload.resource.defaultDatasetId;
    if (!defaultDatasetId) {
      return res.status(200).json({
        success: false,
        error: 'Missing defaultDatasetId',
        message: 'Expected payload.resource.defaultDatasetId in webhook payload.',
      });
    }

    const url = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items`;
    const { data: jobs } = await axios.get(url, {
      params: { token: apifyToken.trim(), format: 'json', clean: true },
      headers: { accept: 'application/json' },
      timeout: 30000,
    });

    // Your actor returns: [{ id, publishedAt, salary, title, jobUrl, companyName, description, applyType, ... }]
    const seenIds = new Set();
    const docs = [];

    const isExcludedCompany = await getExcludedCompanyMatcher();

    let filteredOutByApplyType = 0;
    let filteredOutByCompany = 0;
    let duplicatesInPayload = 0;

    for (const job of jobs) {
      // Filter out EASY_APPLY only (keep EXTERNAL)
      if (job.applyType === 'EASY_APPLY') {
        filteredOutByApplyType += 1;
        continue;
      }

      if (isExcludedCompany(job.companyName)) {
        filteredOutByCompany += 1;
        continue;
      }

      if (seenIds.has(job.id)) {
        duplicatesInPayload += 1;
        continue;
      }
      seenIds.add(job.id);

      const location = (job.location || '').toString();
      const isUS = /United States?|US\b/i.test(location);
      const legion = isUS ? LEGION_VALUES[0] : null; // LEGION_VALUES[0] === 'US'

      docs.push({
        JobId: job.id,
        JobTitle: job.title,
        JobDescription: job.description,
        CompanyName: job.companyName,
        ApplyLink: job.applyUrl,
        Date: new Date(job.publishedAt),
        Source: 'apify',
        Legion: legion,
      });
    }

    let inserted = 0;
    console.log('[webhook/jobs] insert attempt', {
      defaultDatasetId,
      docs: docs.length,
    });

    if (docs.length > 0) {
      try {
        const insertedDocs = await Job.insertMany(docs, { ordered: false });
        inserted = insertedDocs.length;
      } catch (e) {
        // Ignore duplicates in DB (JobId is unique). With ordered:false Mongo may insert
        // non-duplicates and still throw a BulkWriteError.
        if (e && (e.code === 11000 || e.name === 'MongoBulkWriteError' || e.name === 'BulkWriteError')) {
          inserted = Array.isArray(e.insertedDocs) ? e.insertedDocs.length : 0;
        } else {
          throw e;
        }
      }
    }

    console.log('[webhook/jobs] insert result', {
      defaultDatasetId,
      docs: docs.length,
      inserted,
    });

    console.log('[webhook/jobs] processed', {
      receivedAt: new Date().toISOString(),
      defaultDatasetId,
      fetched: jobs.length,
      filteredOutByApplyType,
      filteredOutByCompany,
      duplicatesInPayload,
      attemptedInserts: docs.length,
      inserted,
    });

    return res.status(200).json({
      success: true,
      message: 'Webhook processed',
      receivedAt: new Date().toISOString(),
      defaultDatasetId,
    });
  } catch (error) {
    console.error('[webhook/jobs] error', error);
    return res.status(500).json({
      success: false,
      error: 'Webhook handler failed',
      message: error.message,
    });
  }
};

module.exports = {
  webhookJobs,
};

