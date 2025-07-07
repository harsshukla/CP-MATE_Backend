const express = require('express');
const axios = require('axios');
const { auth } = require('../middleware/auth');
const Stats = require('../models/Stats');
const User = require('../models/User');

const router = express.Router();

// LeetCode GraphQL query
const LEETCODE_QUERY = `
  query getUserProfile($username: String!) {
    matchedUser(username: $username) {
      username
      profile {
        ranking
        realName
        aboutMe
        location
        reputation
        userAvatar
      }
      submitStats {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
        totalSubmissionNum {
          difficulty
          count
          submissions
        }
      }
      submissionCalendar
    }
    recentSubmissionList(username: $username, limit: 50) {
      title
      titleSlug
      timestamp
      statusDisplay
      lang
    }
  }
`;

// Fetch LeetCode data
const fetchLeetCodeData = async (username) => {
  try {
    const response = await axios.post('https://leetcode.com/graphql', {
      query: LEETCODE_QUERY,
      variables: { username }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    return response.data.data;
  } catch (error) {
    console.error('LeetCode API error:', error);
    throw new Error('Failed to fetch LeetCode data');
  }
};

// Fetch Codeforces data
const fetchCodeforcesData = async (handle) => {
  try {
    const [userInfo, userRating, userStatus] = await Promise.all([
      axios.get(`https://codeforces.com/api/user.info?handles=${handle}`),
      axios.get(`https://codeforces.com/api/user.rating?handle=${handle}`),
      axios.get(`https://codeforces.com/api/user.status?handle=${handle}&count=1000`)
    ]);

    return {
      userInfo: userInfo.data.result[0],
      ratingHistory: userRating.data.result,
      submissions: userStatus.data.result
    };
  } catch (error) {
    console.error('Codeforces API error:', error);
    throw new Error('Failed to fetch Codeforces data');
  }
};

// Get user stats
router.get('/', auth, async (req, res) => {
  try {
    const stats = await Stats.find({ userId: req.user._id });
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error fetching stats' });
  }
});

// Fetch and update stats from platforms
router.post('/fetch', auth, async (req, res) => {
  try {
    const { leetcode, codeforces } = req.user.handles;
    const results = {};

    // Fetch LeetCode data
    if (leetcode) {
      try {
        const leetcodeData = await fetchLeetCodeData(leetcode);
        const leetcodeStats = await processLeetCodeData(req.user._id, leetcode, leetcodeData);
        results.leetcode = leetcodeStats;
      } catch (error) {
        results.leetcode = { error: error.message };
      }
    }

    // Fetch Codeforces data
    if (codeforces) {
      try {
        const codeforcesData = await fetchCodeforcesData(codeforces);
        const codeforcesStats = await processCodeforcesData(req.user._id, codeforces, codeforcesData);
        results.codeforces = codeforcesStats;
      } catch (error) {
        results.codeforces = { error: error.message };
      }
    }

    res.json({ 
      message: 'Stats fetched successfully',
      results 
    });
  } catch (error) {
    console.error('Fetch stats error:', error);
    res.status(500).json({ error: 'Server error fetching stats' });
  }
});

// Process LeetCode data
const processLeetCodeData = async (userId, handle, data) => {
  const { matchedUser, recentSubmissionList } = data;
  
  if (!matchedUser) {
    throw new Error('User not found on LeetCode');
  }

  // Calculate stats
  const submitStats = matchedUser.submitStats.acSubmissionNum;
  const totalProblems = submitStats.reduce((sum, stat) => sum + stat.count, 0);
  
  // Process submission calendar
  const submissionCalendar = JSON.parse(matchedUser.submissionCalendar || '{}');
  const dailyActivity = Object.entries(submissionCalendar).map(([date, count]) => ({
    date: new Date(parseInt(date) * 1000),
    problemsSolved: count,
    submissions: count
  }));

  // Process recent submissions
  const submissions = recentSubmissionList.map(sub => ({
    problemId: sub.titleSlug,
    problemName: sub.title,
    status: sub.statusDisplay,
    language: sub.lang,
    timestamp: new Date(parseInt(sub.timestamp) * 1000)
  }));

  // Create or update stats
  const statsData = {
    userId,
    platform: 'leetcode',
    handle,
    rating: {
      current: matchedUser.profile.ranking || 0,
      max: matchedUser.profile.ranking || 0
    },
    problems: {
      total: totalProblems,
      solved: totalProblems,
      attempted: totalProblems,
      byDifficulty: {
        easy: submitStats.find(s => s.difficulty === 'Easy')?.count || 0,
        medium: submitStats.find(s => s.difficulty === 'Medium')?.count || 0,
        hard: submitStats.find(s => s.difficulty === 'Hard')?.count || 0
      }
    },
    activity: {
      submissions,
      dailyActivity
    },
    lastUpdated: new Date()
  };

  await Stats.findOneAndUpdate(
    { userId, platform: 'leetcode' },
    statsData,
    { upsert: true, new: true }
  );

  return statsData;
};

// Process Codeforces data
const processCodeforcesData = async (userId, handle, data) => {
  const { userInfo, ratingHistory, submissions } = data;

  // Calculate current and max rating
  const currentRating = userInfo.rating || 0;
  const maxRating = userInfo.maxRating || 0;

  // Process rating history
  const ratingHistoryData = ratingHistory.map(contest => ({
    rating: contest.newRating,
    date: new Date(contest.ratingUpdateTimeSeconds * 1000),
    contest: contest.contestName
  }));

  // Process submissions
  const processedSubmissions = submissions.map(sub => ({
    problemId: sub.problem.index,
    problemName: sub.problem.name,
    status: sub.verdict,
    language: sub.programmingLanguage,
    timestamp: new Date(sub.creationTimeSeconds * 1000),
    tags: sub.problem.tags || []
  }));

  // Calculate daily activity
  const dailyActivityMap = new Map();
  submissions.forEach(sub => {
    const date = new Date(sub.creationTimeSeconds * 1000).toISOString().split('T')[0];
    const current = dailyActivityMap.get(date) || { problemsSolved: 0, submissions: 0 };
    current.submissions++;
    if (sub.verdict === 'OK') current.problemsSolved++;
    dailyActivityMap.set(date, current);
  });

  const dailyActivity = Array.from(dailyActivityMap.entries()).map(([date, activity]) => ({
    date: new Date(date),
    problemsSolved: activity.problemsSolved,
    submissions: activity.submissions
  }));

  // Store all contests
  const allContests = ratingHistory.map(contest => ({
    name: contest.contestName,
    rank: contest.rank,
    rating: contest.newRating,
    date: new Date(contest.ratingUpdateTimeSeconds * 1000),
    participants: contest.participants || 0
  }));

  // Calculate tag statistics
  const tagCounts = new Map();
  submissions.forEach(sub => {
    if (sub.verdict === 'OK' && sub.problem.tags) {
      sub.problem.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    }
  });

  const byTag = Array.from(tagCounts.entries()).map(([tag, count]) => ({
    tag,
    count
  }));

  // Calculate unique problems solved in official contests
  const uniqueSolved = new Set();
  submissions.forEach(s => {
    if (
      s.verdict === 'OK' &&
      s.problem &&
      s.problem.contestId &&
      s.problem.contestId < 100000 &&
      s.author && s.author.participantType === 'CONTESTANT'
    ) {
      uniqueSolved.add(`${s.problem.contestId}-${s.problem.index}`);
    }
  });

  console.log('Codeforces unique solved problems:', Array.from(uniqueSolved));
  console.log('Codeforces unique solved count:', uniqueSolved.size);

  const statsData = {
    userId,
    platform: 'codeforces',
    handle,
    rating: {
      current: currentRating,
      max: maxRating,
      history: ratingHistoryData
    },
    problems: {
      total: submissions.length,
      solved: uniqueSolved.size,
      attempted: submissions.length,
      byTag
    },
    contests: {
      total: ratingHistory.length,
      bestRank: Math.min(...ratingHistory.map(c => c.rank)),
      history: allContests
    },
    activity: {
      submissions: processedSubmissions,
      dailyActivity
    },
    lastUpdated: new Date()
  };

  await Stats.findOneAndUpdate(
    { userId, platform: 'codeforces' },
    statsData,
    { upsert: true, new: true }
  );

  return statsData;
};

// Get dashboard overview
router.get('/dashboard', auth, async (req, res) => {
  try {
    const stats = await Stats.find({ userId: req.user._id });
    
    // Calculate overview stats
    const overview = {
      totalProblems: 0,
      totalRating: 0,
      platforms: stats.length,
      recentActivity: []
    };

    stats.forEach(stat => {
      overview.totalProblems += stat.problems.solved;
      overview.totalRating += stat.rating.current;
      
      // Get recent activity
      if (stat.activity.dailyActivity.length > 0) {
        const recent = stat.activity.dailyActivity.slice(-7);
        overview.recentActivity.push(...recent);
      }
    });

    // Sort recent activity by date
    overview.recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ overview, stats });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error fetching dashboard' });
  }
});

module.exports = router; 