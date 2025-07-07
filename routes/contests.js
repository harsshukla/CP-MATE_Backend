const express = require('express');
const axios = require('axios');
const router = express.Router();

// Proxy for Codeforces contests
router.get('/codeforces', async (req, res) => {
  try {
    const response = await axios.get('https://codeforces.com/api/contest.list?gym=false');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contests' });
  }
});

// Proxy for LeetCode contests (upcoming & past)
router.get('/leetcode', async (req, res) => {
  try {
    const graphqlQuery = {
      query: `
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
      `
    };
    const response = await axios.post(
      'https://leetcode.com/graphql',
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://leetcode.com',
          'Origin': 'https://leetcode.com',
        },
      }
    );
    res.json(response.data.data.contestCalendar.contests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch LeetCode contests' });
  }
});

// Combined upcoming contests (Codeforces + LeetCode)
router.get('/upcoming', async (req, res) => {
  try {
    // Fetch Codeforces
    const cfRes = await axios.get('https://codeforces.com/api/contest.list?gym=false');
    console.log('Raw Codeforces API data:', cfRes.data);
    const now = Date.now() / 1000;
    const cfUpcoming = cfRes.data.result.filter(c => c.phase === 'BEFORE' && c.startTimeSeconds > now)
      .map(c => ({
        id: c.id,
        name: c.name,
        platform: 'Codeforces',
        start: new Date(c.startTimeSeconds * 1000).toISOString(), // Always send as UTC ISO string
        duration: c.durationSeconds / 3600,
        url: `https://codeforces.com/contest/${c.id}`
      }));
    // Fetch LeetCode
    let lcUpcoming = [];
    let leetcodeApiWorked = true;
    try {
      const graphqlQuery = {
        query: `
          query {
            allContests {
              title
              titleSlug
              startTime
              duration
              isVirtual
            }
          }
        `
      };
      const lcRes = await axios.post(
        'https://leetcode.com/graphql',
        graphqlQuery,
        {
          headers: {
            'Content-Type': 'application/json',
            'Referer': 'https://leetcode.com',
            'Origin': 'https://leetcode.com',
          },
        }
      );
      console.log('Raw LeetCode API data:', lcRes.data);
      lcUpcoming = (lcRes.data.data.allContests || [])
        .filter(c => c.startTime * 1000 > Date.now())
        .map(c => ({
          id: c.titleSlug,
          name: c.title,
          titleSlug: c.titleSlug,
          platform: 'LeetCode',
          start: new Date(c.startTime * 1000).toISOString(),
          duration: c.duration / 3600,
          isVirtual: c.isVirtual,
          url: `https://leetcode.com/contest/${c.titleSlug}`
        }));
    } catch (err) {
      leetcodeApiWorked = false;
      // Manual fallback: generate LeetCode contests for current month
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      let biweeklyCount = 0;
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        // Sunday: Weekly Contest
        if (d.getDay() === 0) {
          lcUpcoming.push({
            id: `weekly-${d.toISOString().split('T')[0]}`,
            name: `LeetCode Weekly Contest`,
            platform: 'LeetCode',
            start: new Date(d),
            duration: 1.5,
            url: 'https://leetcode.com/contest/'
          });
        }
        // Saturday: Biweekly Contest (every other Saturday)
        if (d.getDay() === 6) {
          biweeklyCount++;
          if (biweeklyCount % 2 === 0) {
            lcUpcoming.push({
              id: `biweekly-${d.toISOString().split('T')[0]}`,
              name: `LeetCode Biweekly Contest`,
              platform: 'LeetCode',
              start: new Date(d),
              duration: 1.5,
              url: 'https://leetcode.com/contest/'
            });
          }
        }
      }
    }
    // Merge and sort
    const allUpcoming = [...cfUpcoming, ...lcUpcoming].sort((a, b) => a.start - b.start);
    res.json(allUpcoming);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch upcoming contests' });
  }
});

module.exports = router; 