const express = require('express');
const axios = require('axios');
const router = express.Router();

// GET /api/leetcode/:username
router.get('/:username', async (req, res) => {
  const { username } = req.params;

  const query = `
    query userContestRankingInfo($username: String!) {
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        totalParticipants
        topPercentage
      }
      userContestRankingHistory(username: $username) {
        contest {
          title
          startTime
        }
        rating
        ranking
        trendDirection
      }
    }
  `;

  const variables = { username };

  try {
    const response = await axios.post(
      'https://leetcode.com/graphql',
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'Origin': 'https://leetcode.com',
        },
      }
    );
    return res.status(200).json(response.data.data);
  } catch (error) {
    console.error('LeetCode API error:', error.message, error.response?.data);
    return res.status(500).json({ error: 'Failed to fetch data from LeetCode' });
  }
});

// GET /api/leetcode/full-rating-history/:username
router.get('/full-rating-history/:username', async (req, res) => {
  const { username } = req.params;

  // 1. Fetch all contests
  const contestQuery = `
    query {
      contestCalendar {
        contests {
          title
          titleSlug
          startTime
          duration
        }
      }
    }
  `;

  // 2. Fetch user contest history
  const userQuery = `
    query userContestRankingInfo($username: String!) {
      userContestRankingHistory(username: $username) {
        contest {
          title
          startTime
        }
        rating
        ranking
        trendDirection
      }
    }
  `;

  try {
    // Fetch all contests
    const contestRes = await axios.post(
      'https://leetcode.com/graphql',
      { query: contestQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'Origin': 'https://leetcode.com'
        }
      }
    );
    const allContests = contestRes.data.data.contestCalendar.contests;

    // Fetch user history
    const userRes = await axios.post(
      'https://leetcode.com/graphql',
      { query: userQuery, variables: { username } },
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'Origin': 'https://leetcode.com'
        }
      }
    );
    const userHistory = userRes.data.data.userContestRankingHistory || [];

    // Map user history by contest startTime for quick lookup
    const userMap = {};
    userHistory.forEach(h => {
      if (h.contest && h.contest.startTime) {
        userMap[h.contest.startTime] = h;
      }
    });

    // Find first and last contest user participated in
    const participatedTimes = userHistory.map(h => h.contest.startTime);
    const minTime = Math.min(...participatedTimes);
    const maxTime = Math.max(...participatedTimes);

    // Build full timeline
    const timeline = allContests
      .filter(c => c.startTime >= minTime && c.startTime <= maxTime)
      .map(c => {
        const userData = userMap[c.startTime];
        // Short title: W455, B124, etc.
        let shortTitle = '';
        if (/Weekly Contest/.test(c.title)) {
          shortTitle = 'W' + c.title.match(/\d+/)[0];
        } else if (/Biweekly Contest/.test(c.title)) {
          shortTitle = 'B' + c.title.match(/\d+/)[0];
        } else {
          shortTitle = c.title;
        }
        return {
          title: c.title,
          shortTitle,
          startTime: c.startTime,
          rating: userData ? userData.rating : null,
          participated: !!userData,
          ranking: userData ? userData.ranking : null
        };
      });

    res.json({ timeline });
  } catch (error) {
    console.error('LeetCode API error:', error.message, error.response?.data);
    res.status(500).json({ error: 'Failed to fetch data from LeetCode' });
  }
});

module.exports = router; 