require('dotenv').config();
const mongoose = require("mongoose");
const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
  });


const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  friends: [{
    name: String,
    email: String,
    balance: Number
  }],
  groups: [{
    name: String,
    members: [String] // Array of email addresses
  }],
  activities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }]
});

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  createdBy: {
    type: String,
    required: true
  },
  members: [{
    name: String,
    email: String
  }],
  activities: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }]
});

const expenseSchema = new mongoose.Schema({
  expenseName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  createdBy: {
    type: String,
    required: true
  },
  participants: [String], // Array of email addresses
  splitMethod: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  groupName: {
    type: String,
    default: null // Add default null value for groupName
  },
  customShares: {
    type: Map,
    of: Number,
    default: {}
  }
});

const User = mongoose.model("User", userSchema);
const Group = mongoose.model("Group", groupSchema);
const Expense = mongoose.model("Expense", expenseSchema);

module.exports = { User, Group, Expense };
