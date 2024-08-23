const express = require("express");
const cors = require("cors");
const { User, Group, Expense } = require("./mongo");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.post("/", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && user.password === password) {
      res.json({ status: "exist", name: user.name });
    } else {
      res.json("notexist");
    }
  } catch (e) {
    console.error(e);
    res.json("fail");
  }
});

app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user) {
      res.json("exist");
    } else {
      const newUser = new User({ name, email, password });
      await newUser.save();
      res.json("notexist");
    }
  } catch (e) {
    console.error(e);
    res.json("fail");
  }
});

app.post("/addFriend", async (req, res) => {
  const { userEmail, friendName, friendNumber, friendEmail } = req.body;
  console.log("Received add friend request:", req.body);

  try {
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log(`User not found: ${userEmail}`);
      return res.json("user_not_found");
    }

    const friend = await User.findOne({ email: friendEmail });
    if (!friend) {
      console.log(`Friend not found: ${friendEmail}`);
      return res.json("friend_not_found");
    }

    await User.updateOne(
      { email: userEmail },
      { $addToSet: { friends: { name: friendName, number: friendNumber, email: friendEmail, balance: 0 } } }
    );
    await User.updateOne(
      { email: friendEmail },
      { $addToSet: { friends: { name: user.name, email: userEmail, balance: 0 } } }
    );
    res.json("success");
  } catch (e) {
    console.error(e);
    res.json("error");
  }
});

app.post("/getFriends", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    res.json({ friends: user?.friends || [] });
  } catch (e) {
    console.error(e);
    res.json({ friends: [] });
  }
});

app.post("/createGroup", async (req, res) => {
  const { groupName, email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`User not found: ${email}`);
      return res.json("user_not_found");
    }

    const newGroup = new Group({ name: groupName, createdBy: email, members: [{ name: user.name, email: email }] });
    await newGroup.save();
    res.json("success");
  } catch (e) {
    console.error(e);
    res.json("error");
  }
});

app.post("/addMemberToGroup", async (req, res) => {
  const { userEmail, groupName, memberEmail } = req.body;

  try {
    const user = await User.findOne({ email: userEmail });
    const member = await User.findOne({ email: memberEmail });
    const group = await Group.findOne({ name: groupName, createdBy: userEmail });

    if (!user) {
      return res.json("user_not_found");
    }
    if (!member) {
      return res.json("member_not_found");
    }
    if (!group) {
      return res.json("group_not_found");
    }

    const isMemberAlreadyInGroup = group.members.some(m => m.email === memberEmail);
    if (isMemberAlreadyInGroup) {
      return res.json("member_already_in_group");
    }

    await Group.updateOne(
      { name: groupName, createdBy: userEmail },
      { $addToSet: { members: { name: member.name, email: member.email } } }
    );

    await User.updateOne(
      { email: memberEmail },
      { $addToSet: { groups: { name: groupName, members: [userEmail] } } }
    );

    res.json("success");
  } catch (e) {
    console.error(e);
    res.json("error");
  }
});

app.post("/getGroups", async (req, res) => {
  const { email } = req.body;

  try {
    const groups = await Group.find({ "members.email": email });
    res.json({ groups: groups || [] });
  } catch (e) {
    console.error(e);
    res.json({ groups: [] });
  }
});

app.post("/addExpense", async (req, res) => {
  const { email, expenseName, amount, selectedFriends, selectedGroups, splitMethod, customShares } = req.body;

  try {
    let participants =  selectedFriends.includes(email) ? [...selectedFriends] : [email, ...selectedFriends];

    for (const groupId of selectedGroups) {
      const group = await Group.findById(groupId);
      if (group) {
        participants = [...participants, ...group.members.map((member) => member.email)];
      }
    }

    const uniqueParticipants = [...new Set(participants)]; // Ensure uniqueness
    console.log("Unique Participants:", uniqueParticipants); // Debugging: log unique participants
    const totalParticipants = uniqueParticipants.length;

    // Handle custom shares and replace dots in email addresses for map keys
    let owedAmounts;
    if (customShares && Object.keys(customShares).length > 0) {
      const totalShares = Object.values(customShares).reduce((a, b) => a + b, 0);
      owedAmounts = uniqueParticipants.reduce((acc, participant) => {
        const key = participant.replace(/\./g, '_');
        acc[key] = customShares[participant] ? (customShares[participant] / totalShares) * parseFloat(amount) : 0;
        return acc;
      }, {});
    } else {
      owedAmounts = uniqueParticipants.reduce((acc, participant) => {
        acc[participant.replace(/\./g, '_')] = parseFloat(amount) / totalParticipants;
        return acc;
      }, {});
    }

    const expense = new Expense({
      expenseName,
      amount: parseFloat(amount),
      createdBy: email,
      participants: uniqueParticipants,
      splitMethod,
      date: new Date(), // Ensure the correct date is set
      groupName: selectedGroups.length > 0 ? selectedGroups[0] : null,
      customShares: owedAmounts,
    });

    await expense.save();
    console.log('Expense saved:', expense);

    // Update each participant's balance and activities
    const updates = uniqueParticipants.map(async (participant) => {
      const key = participant.replace(/\./g, '_');
      const balanceUpdate = owedAmounts[key];

      await User.updateOne(
        { email: participant },
        {
          $push: { activities: expense._id },
          //$inc: { 'friends.$[friend].balance': participant === payer ? balanceUpdate * (totalParticipants - 1) : -balanceUpdate }
        },
        //{ arrayFilters: [{ 'friend.email': participant === payer ? email : participant }] }
      );

      for (const otherParticipant of uniqueParticipants) {
        if (otherParticipant !== participant) {
          const otherKey = otherParticipant.replace(/\./g, '_');
          await User.updateOne(
            { email: participant, 'friends.email': otherParticipant },
            { $inc: { 'friends.$.balance': participant === email ? balanceUpdate : -balanceUpdate } }
          );
        }
      }

      console.log(`Updated balance and activities for participant: ${participant}`);
    });

    await Promise.all(updates);

    res.json("success");
  } catch (e) {
    console.error('Error adding expense:', e);
    res.json("error");
  }
});





app.post("/getActivities", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email }).populate('activities');
    console.log('User:', user); // Verify user details
    console.log('User activities:', user.activities); // Verify activities associated with the user

    const activitiesWithNames = await Promise.all(user.activities.map(async (activity) => {
      const participantsWithNames = await Promise.all(activity.participants.map(async (participantEmail) => {
        const participant = await User.findOne({ email: participantEmail });
        if (!participant) {
          console.log(`Participant not found for email: ${participantEmail}`);
          return { email: participantEmail, name: 'Unknown', owedAmount: activity.customShares[participantEmail] || (activity.amount / activity.participants.length) };
        }
        return { email: participant.email, name: participant.name, owedAmount: activity.customShares[participantEmail] || (activity.amount / activity.participants.length) };
      }));

      const createdByUser = await User.findOne({ email: activity.createdBy });
      let groupName = '';
      if (activity.groupName) {
        const group = await Group.findOne({ name: activity.groupName });
        groupName = group ? group.name : '';
      }

      return {
        ...activity._doc,
        participants: participantsWithNames,
        createdByName: createdByUser ? createdByUser.name : activity.createdBy,
        groupName
      };
    }));

    console.log('Activities with names:', activitiesWithNames); // Verify activities with names

    res.json({ activities: activitiesWithNames });
  } catch (e) {
    console.error(e);
    res.json({ activities: [] });
  }
});



const port = process.env.PORT || 8000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

