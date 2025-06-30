const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  platform: {
    type: String,
    enum: ['leetcode', 'codeforces'],
    required: true
  },
  handle: {
    type: String,
    required: true
  },
  rating: {
    current: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    history: [{
      rating: Number,
      date: Date,
      contest: String
    }]
  },
  problems: {
    total: { type: Number, default: 0 },
    solved: { type: Number, default: 0 },
    attempted: { type: Number, default: 0 },
    byDifficulty: {
      easy: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      hard: { type: Number, default: 0 }
    },
    byTag: [{
      tag: String,
      count: Number
    }]
  },
  contests: {
    total: { type: Number, default: 0 },
    bestRank: { type: Number, default: 0 },
    history: [{
      name: String,
      rank: Number,
      rating: Number,
      date: Date,
      participants: Number
    }]
  },
  activity: {
    submissions: [{
      problemId: String,
      problemName: String,
      status: String,
      language: String,
      timestamp: Date,
      tags: [String]
    }],
    dailyActivity: [{
      date: Date,
      problemsSolved: Number,
      submissions: Number
    }]
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
statsSchema.index({ userId: 1, platform: 1 }, { unique: true });

// Method to update daily activity
statsSchema.methods.updateDailyActivity = function(date, problemsSolved, submissions) {
  const dateStr = date.toISOString().split('T')[0];
  const existingIndex = this.activity.dailyActivity.findIndex(
    activity => activity.date.toISOString().split('T')[0] === dateStr
  );
  
  if (existingIndex >= 0) {
    this.activity.dailyActivity[existingIndex].problemsSolved += problemsSolved;
    this.activity.dailyActivity[existingIndex].submissions += submissions;
  } else {
    this.activity.dailyActivity.push({
      date: date,
      problemsSolved: problemsSolved,
      submissions: submissions
    });
  }
};

module.exports = mongoose.model('Stats', statsSchema); 