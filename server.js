const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static("public"))

// Store connected users
const users = {}
const waitingUsers = {
  video: [],
  text: [],
}

// Track online users count
let onlineUsers = 0
let videoUsers = 0
let textUsers = 0

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id)
  onlineUsers++

  // Send updated stats to all clients
  updateStats()

  // When a user joins, pair them with a random user
  socket.on("join", () => {
    // Get the user's mode from their socket data
    const mode = socket.data.mode || "text"

    // Remove user from any existing pair
    const existingPair = users[socket.id]
    if (existingPair) {
      users[existingPair] = null
      delete users[socket.id]
    }

    // Remove from waiting lists if present
    removeFromWaitingList(socket.id)

    // Add to the appropriate waiting list
    waitingUsers[mode].push(socket.id)
    socket.data.mode = mode

    // Update user counts
    if (mode === "video") {
      videoUsers++
      textUsers = Math.max(0, textUsers - 1)
    } else {
      textUsers++
      videoUsers = Math.max(0, videoUsers - 1)
    }
    updateStats()

    // Try to find a match
    findMatch(socket.id, mode)
  })

  // WebRTC signaling (OFFER, ANSWER, ICE)
  socket.on("offer", (data) => {
    io.to(data.to).emit("offer", { offer: data.offer, from: socket.id })
  })

  socket.on("answer", (data) => {
    io.to(data.to).emit("answer", { answer: data.answer, from: socket.id })
  })

  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", data.candidate)
  })

  // Text chat
  socket.on("message", (data) => {
    console.log(`Message from ${socket.id} to ${data.to}: ${data.message}`)
    io.to(data.to).emit("message", data.message)
  })

  // Typing indicators
  socket.on("typing", (data) => {
    io.to(data.to).emit("typing", socket.id)
  })

  socket.on("stop-typing", (data) => {
    io.to(data.to).emit("stop-typing", socket.id)
  })

  // Disconnection
  socket.on("disconnect", () => {
    // Notify paired user
    const pairedUser = users[socket.id]
    if (pairedUser) {
      io.to(pairedUser).emit("user-disconnected")
      delete users[pairedUser]
    }

    // Remove from users and waiting list
    delete users[socket.id]
    removeFromWaitingList(socket.id)

    // Update user counts
    onlineUsers--
    if (socket.data.mode === "video") {
      videoUsers = Math.max(0, videoUsers - 1)
    } else {
      textUsers = Math.max(0, textUsers - 1)
    }
    updateStats()

    console.log("User disconnected:", socket.id)
  })
})

// Find a match for a user
function findMatch(userId, mode) {
  // Get the appropriate waiting list
  const waitingList = waitingUsers[mode]

  // Find a user that isn't the current user
  let matchIndex = -1
  for (let i = 0; i < waitingList.length; i++) {
    if (waitingList[i] !== userId) {
      matchIndex = i
      break
    }
  }

  if (matchIndex !== -1) {
    const matchedUserId = waitingList[matchIndex]

    // Remove both users from waiting list
    waitingList.splice(matchIndex, 1)
    const currentUserIndex = waitingList.indexOf(userId)
    if (currentUserIndex !== -1) {
      waitingList.splice(currentUserIndex, 1)
    }

    // Create the pair
    users[userId] = matchedUserId
    users[matchedUserId] = userId

    console.log(`Pairing ${userId} with ${matchedUserId}`)

    // Notify both users
    io.to(userId).emit("paired", matchedUserId)
    io.to(matchedUserId).emit("paired", userId)
  }
}

// Remove a user from all waiting lists
function removeFromWaitingList(userId) {
  for (const mode in waitingUsers) {
    const index = waitingUsers[mode].indexOf(userId)
    if (index !== -1) {
      waitingUsers[mode].splice(index, 1)
    }
  }
}

// Update stats for all connected clients
function updateStats() {
  io.emit("stats", {
    online: onlineUsers,
    video: videoUsers,
    text: textUsers,
  })
}

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

