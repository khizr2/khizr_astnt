const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { GlobalPreferenceLearner } = require('../services/PreferenceLearner');

const router = express.Router();
router.use(authenticateToken);

// Initialize Global Preference Learner
const preferenceLearner = new GlobalPreferenceLearner();

// Get user preferences
router.get('/', async (req, res) => {
  try {
    const preferences = await preferenceLearner.getUserPreferences(req.user.id);

    res.json({
      success: true,
      preferences: preferences || {}
    });
  } catch (error) {
    logger.error('Error fetching preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preferences'
    });
  }
});

// Update specific preference
router.patch('/:preferenceName', async (req, res) => {
  try {
    const { preferenceName } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    await preferenceLearner.updatePreference(req.user.id, preferenceName, enabled);

    res.json({
      success: true,
      message: `Preference ${preferenceName} updated successfully`
    });
  } catch (error) {
    logger.error('Error updating preference:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preference'
    });
  }
});

// Reset all preferences
router.post('/reset', async (req, res) => {
  try {
    await preferenceLearner.resetUserPreferences(req.user.id);

    res.json({
      success: true,
      message: 'All preferences have been reset'
    });
  } catch (error) {
    logger.error('Error resetting preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset preferences'
    });
  }
});

module.exports = router;
