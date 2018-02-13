'use strict';

require('dotenv').config();

module.exports = {
  glassfrogApiKey: process.env.GLASSFROG_API_KEY || '',
  slackApiKey: process.env.SLACK_TOKEN || ''
};
