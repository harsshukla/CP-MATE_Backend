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

// Get current month range
const getCurrentMonthRange = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startOfMonth, endOfMonth };
};

// Combined contests for current month (past + upcoming)
router.get('/upcoming', async (req, res) => {
  try {
    const { startOfMonth, endOfMonth } = getCurrentMonthRange();
    const monthStart = startOfMonth.getTime() / 1000;
    const monthEnd = endOfMonth.getTime() / 1000;
    
    console.log('Fetching contests for month:', startOfMonth.toISOString(), 'to', endOfMonth.toISOString());
    
    // Fetch Codeforces contests for the month
    const cfRes = await axios.get('https://codeforces.com/api/contest.list?gym=false');
    console.log('Raw Codeforces API data:', cfRes.data);
    
    const cfContests = cfRes.data.result
      .filter(c => {
        const contestStart = c.startTimeSeconds;
        return contestStart >= monthStart && contestStart <= monthEnd;
      })
      .map(c => ({
        id: c.id,
        name: c.name,
        platform: 'Codeforces',
        start: new Date(c.startTimeSeconds * 1000).toISOString(),
        duration: c.durationSeconds / 3600,
        url: `https://codeforces.com/contest/${c.id}`,
        phase: c.phase // 'BEFORE', 'CODING', 'PENDING_SYSTEM_TEST', 'SYSTEM_TEST', 'FINISHED'
      }));

    // Fetch LeetCode contests for the month
    let lcContests = [];
    let leetcodeApiWorked = true;
    
    try {
      // Try the newer API first
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
      
      lcContests = (lcRes.data.data.allContests || [])
        .filter(c => {
          const contestStart = c.startTime;
          return contestStart >= monthStart && contestStart <= monthEnd;
        })
        .map(c => ({
          id: c.titleSlug,
          name: c.title,
          titleSlug: c.titleSlug,
          platform: 'LeetCode',
          start: new Date(c.startTime * 1000).toISOString(),
          duration: c.duration / 3600,
          isVirtual: c.isVirtual,
          url: `https://leetcode.com/contest/${c.titleSlug}`,
          phase: c.startTime * 1000 > Date.now() ? 'BEFORE' : 'FINISHED'
        }));
        
    } catch (err) {
      console.error('LeetCode API failed, using fallback:', err.message);
      leetcodeApiWorked = false;
      
      // Improved fallback: generate LeetCode contests for current month
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      let biweeklyCount = 0;
      const currentDate = new Date();
      
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const contestDate = new Date(d);
        contestDate.setHours(8, 0, 0, 0); // Set to 8 AM for weekly contests
        
        // Sunday: Weekly Contest
        if (d.getDay() === 0) {
          lcContests.push({
            id: `weekly-${d.toISOString().split('T')[0]}`,
            name: `LeetCode Weekly Contest`,
            platform: 'LeetCode',
            start: contestDate.toISOString(),
            duration: 1.5,
            url: 'https://leetcode.com/contest/',
            phase: contestDate > currentDate ? 'BEFORE' : 'FINISHED',
            isFallback: true
          });
        }
        
        // Saturday: Biweekly Contest (every other Saturday)
        if (d.getDay() === 6) {
          biweeklyCount++;
          if (biweeklyCount % 2 === 0) {
            const biweeklyDate = new Date(d);
            biweeklyDate.setHours(20, 0, 0, 0); // Set to 8 PM for biweekly contests
            
            lcContests.push({
              id: `biweekly-${d.toISOString().split('T')[0]}`,
              name: `LeetCode Biweekly Contest`,
              platform: 'LeetCode',
              start: biweeklyDate.toISOString(),
              duration: 1.5,
              url: 'https://leetcode.com/contest/',
              phase: biweeklyDate > currentDate ? 'BEFORE' : 'FINISHED',
              isFallback: true
            });
          }
        }
      }
    }

    // Merge and sort by start time
    const allContests = [...cfContests, ...lcContests].sort((a, b) => new Date(a.start) - new Date(b.start));
    
    console.log(`Found ${cfContests.length} Codeforces contests and ${lcContests.length} LeetCode contests for the month`);
    console.log('Total contests:', allContests.length);
    
    res.json({
      contests: allContests,
      monthRange: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
      },
      leetcodeApiStatus: leetcodeApiWorked ? 'working' : 'fallback'
    });
    
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ error: 'Failed to fetch contests' });
  }
});

// Get contests for a specific month (past + upcoming)
router.get('/monthly/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month) - 1; // Convert to 0-based month
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    
    const startOfMonth = new Date(yearNum, monthNum, 1);
    const endOfMonth = new Date(yearNum, monthNum + 1, 0, 23, 59, 59, 999);
    const monthStart = startOfMonth.getTime() / 1000;
    const monthEnd = endOfMonth.getTime() / 1000;
    
    console.log(`Fetching contests for ${year}-${month + 1}:`, startOfMonth.toISOString(), 'to', endOfMonth.toISOString());
    
    // Fetch Codeforces contests for the month
    const cfRes = await axios.get('https://codeforces.com/api/contest.list?gym=false');
    
    const cfContests = cfRes.data.result
      .filter(c => {
        const contestStart = c.startTimeSeconds;
        return contestStart >= monthStart && contestStart <= monthEnd;
      })
      .map(c => ({
        id: c.id,
        name: c.name,
        platform: 'Codeforces',
        start: new Date(c.startTimeSeconds * 1000).toISOString(),
        duration: c.durationSeconds / 3600,
        url: `https://codeforces.com/contest/${c.id}`,
        phase: c.phase
      }));

    // Fetch LeetCode contests for the month
    let lcContests = [];
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
      
      lcContests = (lcRes.data.data.allContests || [])
        .filter(c => {
          const contestStart = c.startTime;
          return contestStart >= monthStart && contestStart <= monthEnd;
        })
        .map(c => ({
          id: c.titleSlug,
          name: c.title,
          titleSlug: c.titleSlug,
          platform: 'LeetCode',
          start: new Date(c.startTime * 1000).toISOString(),
          duration: c.duration / 3600,
          isVirtual: c.isVirtual,
          url: `https://leetcode.com/contest/${c.titleSlug}`,
          phase: c.startTime * 1000 > Date.now() ? 'BEFORE' : 'FINISHED'
        }));
        
    } catch (err) {
      console.error('LeetCode API failed for monthly endpoint:', err.message);
      leetcodeApiWorked = false;
      
      // Fallback: generate LeetCode contests for the specified month
      const firstDay = new Date(yearNum, monthNum, 1);
      const lastDay = new Date(yearNum, monthNum + 1, 0);
      
      let biweeklyCount = 0;
      const currentDate = new Date();
      
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const contestDate = new Date(d);
        contestDate.setHours(8, 0, 0, 0); // Set to 8 AM for weekly contests
        
        // Sunday: Weekly Contest
        if (d.getDay() === 0) {
          lcContests.push({
            id: `weekly-${d.toISOString().split('T')[0]}`,
            name: `LeetCode Weekly Contest`,
            platform: 'LeetCode',
            start: contestDate.toISOString(),
            duration: 1.5,
            url: 'https://leetcode.com/contest/',
            phase: contestDate > currentDate ? 'BEFORE' : 'FINISHED',
            isFallback: true
          });
        }
        
        // Saturday: Biweekly Contest (every other Saturday)
        if (d.getDay() === 6) {
          biweeklyCount++;
          if (biweeklyCount % 2 === 0) {
            const biweeklyDate = new Date(d);
            biweeklyDate.setHours(20, 0, 0, 0); // Set to 8 PM for biweekly contests
            
            lcContests.push({
              id: `biweekly-${d.toISOString().split('T')[0]}`,
              name: `LeetCode Biweekly Contest`,
              platform: 'LeetCode',
              start: biweeklyDate.toISOString(),
              duration: 1.5,
              url: 'https://leetcode.com/contest/',
              phase: biweeklyDate > currentDate ? 'BEFORE' : 'FINISHED',
              isFallback: true
            });
          }
        }
      }
    }

    // Merge and sort by start time
    const allContests = [...cfContests, ...lcContests].sort((a, b) => new Date(a.start) - new Date(b.start));
    
    res.json({
      contests: allContests,
      monthRange: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
      },
      leetcodeApiStatus: leetcodeApiWorked ? 'working' : 'fallback',
      month: {
        year: yearNum,
        month: monthNum + 1,
        monthName: startOfMonth.toLocaleString('default', { month: 'long' })
      }
    });
    
  } catch (error) {
    console.error('Error fetching monthly contests:', error);
    res.status(500).json({ error: 'Failed to fetch monthly contests' });
  }
});

module.exports = router; 