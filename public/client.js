const socket = io();

let peerConnection;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let localStream;

// DOM Elements
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const videoChatBtn = document.getElementById("video-chat-btn");
const textChatBtn = document.getElementById("text-chat-btn");
const videoChatDiv = document.getElementById("video-chat");
const textChatDiv = document.getElementById("text-chat");
const nextBtn = document.getElementById("next-btn");
const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const emojiBtn = document.getElementById("emoji-btn");
const muteBtn = document.getElementById("mute-btn");
const cameraBtn = document.getElementById("camera-off-btn");
const videoFilter = document.getElementById("video-filter");
const themeToggle = document.getElementById("theme-toggle");
const shareScreenBtn = document.getElementById("share-screen-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const snapshotBtn = document.getElementById("snapshot-btn");
const connectionStatus = document.getElementById("connection-status");
const chatStatus = document.getElementById("chat-status");
const submitReportBtn = document.getElementById("submit-report");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const toggleHudBtn = document.getElementById("toggle-hud-btn");

let currentMode = null;
let pairedUser = null;
let typingTimeout;
let isMuted = false;
let isCameraOff = false;
let screenSharingStream = null;
let zoomLevel = 1;
let isFullscreen = false;
let isHudHidden = false;

// Adicione esta função para atualizar as cores dos elementos dinâmicos quando o tema muda
function updateThemeColors() {
  const isDarkMode = document.body.classList.contains("dark-mode");

  // Atualizar cores dos elementos de formulário
  document.querySelectorAll(".form-control, .form-select").forEach((el) => {
    if (isDarkMode) {
      el.style.backgroundColor = "#1e1e1e";
      el.style.color = "#f8f9fa";
      el.style.borderColor = "#2d2d2d";
    } else {
      el.style.backgroundColor = "";
      el.style.color = "";
      el.style.borderColor = "";
    }
  });

  // Atualizar cores dos badges
  document.querySelectorAll(".badge").forEach((el) => {
    if (
      !el.classList.contains("bg-success") &&
      !el.classList.contains("bg-primary") &&
      !el.classList.contains("bg-info") &&
      !el.classList.contains("bg-danger") &&
      !el.classList.contains("bg-warning")
    ) {
      if (isDarkMode) {
        el.style.backgroundColor = "#4e54c8";
      } else {
        el.style.backgroundColor = "";
      }
    }
  });
}

// Theme Toggle
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  const icon = themeToggle.querySelector("i");
  if (document.body.classList.contains("dark-mode")) {
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
  } else {
    icon.classList.remove("fa-sun");
    icon.classList.add("fa-moon");
  }

  // Atualizar cores dos elementos dinâmicos
  updateThemeColors();
});

// Start Video Chat
videoChatBtn.onclick = () => {
  currentMode = "video";
  videoChatDiv.classList.remove("hidden");
  textChatDiv.classList.add("hidden");
  startVideoChat();

  // Update active button state
  videoChatBtn.classList.remove("btn-outline-primary");
  videoChatBtn.classList.add("btn-primary");
  textChatBtn.classList.remove("btn-primary");
  textChatBtn.classList.add("btn-outline-primary");
};

// Start Text Chat
textChatBtn.onclick = () => {
  currentMode = "text";
  textChatDiv.classList.remove("hidden");
  videoChatDiv.classList.add("hidden");
  socket.emit("join");

  // Update active button state
  textChatBtn.classList.remove("btn-outline-primary");
  textChatBtn.classList.add("btn-primary");
  videoChatBtn.classList.remove("btn-primary");
  videoChatBtn.classList.add("btn-outline-primary");

  // Stop video stream if it exists
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
};

// WebRTC Setup
async function startVideoChat() {
  try {
    connectionStatus.textContent = "Acessando câmera...";
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      connectionStatus.textContent = "Conectado";
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: pairedUser, candidate: event.candidate });
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === "disconnected" || peerConnection.iceConnectionState === "failed") {
        connectionStatus.textContent = "Desconectado";
      }
    };

    connectionStatus.textContent = "Procurando...";
    socket.emit("join");

    // Populate camera and microphone options
    populateMediaDevices();
  } catch (error) {
    console.error("Error accessing media:", error);
    connectionStatus.textContent = "Erro ao acessar câmera";
    showNotification("Erro ao acessar câmera ou microfone", "danger");
  }
}

// Populate media devices in settings
async function populateMediaDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const audioDevices = devices.filter((device) => device.kind === "audioinput");

    const cameraSelect = document.getElementById("camera-select");
    const micSelect = document.getElementById("mic-select");

    cameraSelect.innerHTML = "";
    micSelect.innerHTML = "";

    videoDevices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Câmera ${cameraSelect.options.length + 1}`;
      cameraSelect.appendChild(option);
    });

    audioDevices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Microfone ${micSelect.options.length + 1}`;
      micSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error enumerating devices:", error);
  }
}

// Change camera or microphone
async function changeMediaDevice(type, deviceId) {
  if (!localStream) return;

  const constraints = {};

  if (type === "video") {
    constraints.video = { deviceId: { exact: deviceId } };
    constraints.audio = { deviceId: localStream.getAudioTracks()[0]?.getSettings().deviceId };
  } else {
    constraints.audio = { deviceId: { exact: deviceId } };
    constraints.video = { deviceId: localStream.getVideoTracks()[0]?.getSettings().deviceId };
  }

  try {
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Replace tracks in the peer connection
    if (peerConnection) {
      const senders = peerConnection.getSenders();

      if (type === "video") {
        const videoTrack = newStream.getVideoTracks()[0];
        const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }
      } else {
        const audioTrack = newStream.getAudioTracks()[0];
        const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio");
        if (audioSender) {
          audioSender.replaceTrack(audioTrack);
        }
      }
    }

    // Update local video
    if (type === "video") {
      const oldVideoTrack = localStream.getVideoTracks()[0];
      localStream.removeTrack(oldVideoTrack);
      localStream.addTrack(newStream.getVideoTracks()[0]);
    } else {
      const oldAudioTrack = localStream.getAudioTracks()[0];
      localStream.removeTrack(oldAudioTrack);
      localStream.addTrack(newStream.getAudioTracks()[0]);
    }

    localVideo.srcObject = localStream;
  } catch (error) {
    console.error("Error changing media device:", error);
    showNotification("Erro ao mudar dispositivo", "danger");
  }
}

// Add event listeners for device selection
document.getElementById("camera-select").addEventListener("change", (e) => {
  changeMediaDevice("video", e.target.value);
});

document.getElementById("mic-select").addEventListener("change", (e) => {
  changeMediaDevice("audio", e.target.value);
});

// Next Button - Find a new partner
nextBtn.onclick = () => {
  resetAndJoin();
  showNotification("Procurando um novo parceiro...", "info");
};

function resetAndJoin() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (screenSharingStream) {
    screenSharingStream.getTracks().forEach((track) => track.stop());
    screenSharingStream = null;
  }

  remoteVideo.srcObject = null;
  zoomLevel = 1;
  remoteVideo.style.transform = `scale(${zoomLevel})`;

  if (currentMode === "video") {
    connectionStatus.textContent = "Procurando...";
    if (!localStream) {
      startVideoChat();
    } else {
      peerConnection = new RTCPeerConnection(config);
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        connectionStatus.textContent = "Conectado";
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { to: pairedUser, candidate: event.candidate });
        }
      };

      socket.emit("join");
    }
  } else {
    chatBox.innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-primary mb-3" role="status"><span class="visually-hidden">Carregando...</span></div><p class="welcome-msg">Procurando alguém para conversar...</p></div>';
    chatStatus.textContent = "Procurando...";
    chatStatus.className = "text-warning";
    messageInput.disabled = true;
    emojiBtn.disabled = true;
    sendBtn.disabled = true;
    socket.emit("join");
  }
}

// Socket.IO Events
socket.on("paired", async (userId) => {
  pairedUser = userId;
  console.log("Paired with:", userId);
  showNotification("Conectado a um estranho!", "success");

  if (currentMode === "video") {
    try {
      connectionStatus.textContent = "Conectando...";
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", { offer, to: pairedUser });
    } catch (error) {
      console.error("Error creating offer:", error);
      connectionStatus.textContent = "Erro ao conectar";
    }
  } else {
    chatBox.innerHTML = "";
    addMessageToChat("Você está conectado a um estranho!", "system");
    chatStatus.textContent = "Online";
    chatStatus.className = "text-success";
    messageInput.disabled = false;
    emojiBtn.disabled = false;
    sendBtn.disabled = false;
  }
});

socket.on("offer", async (data) => {
  pairedUser = data.from;

  if (currentMode === "video") {
    try {
      connectionStatus.textContent = "Conectando...";
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { answer, to: pairedUser });
    } catch (error) {
      console.error("Error handling offer:", error);
      connectionStatus.textContent = "Erro ao conectar";
    }
  }
});

socket.on("answer", (data) => {
  peerConnection
    .setRemoteDescription(new RTCSessionDescription(data.answer))
    .then(() => {
      connectionStatus.textContent = "Conectado";
    })
    .catch((error) => {
      console.error("Error setting remote description:", error);
      connectionStatus.textContent = "Erro ao conectar";
    });
});

socket.on("ice-candidate", (candidate) => {
  if (peerConnection) {
    peerConnection
      .addIceCandidate(new RTCIceCandidate(candidate))
      .catch((error) => console.error("Error adding ICE candidate:", error));
  }
});

socket.on("user-disconnected", () => {
  if (peerConnection) peerConnection.close();
  remoteVideo.srcObject = null;

  if (currentMode === "video") {
    connectionStatus.textContent = "Usuário desconectado";
  } else {
    addMessageToChat("Usuário desconectado.", "system");
    chatStatus.textContent = "Desconectado";
    chatStatus.className = "text-danger";
    messageInput.disabled = true;
    emojiBtn.disabled = true;
    sendBtn.disabled = true;
  }

  showNotification("Usuário desconectado", "warning");
});

// Text Chat
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

function sendMessage() {
  const message = messageInput.value.trim();
  if (message && pairedUser) {
    socket.emit("message", { to: pairedUser, message });
    addMessageToChat(message, "self");
    messageInput.value = "";
  }
}

socket.on("message", (message) => {
  addMessageToChat(message, "stranger");

  // Play notification sound if enabled
  if (document.getElementById("autoplay-sounds").checked) {
    playNotificationSound();
  }
});

function addMessageToChat(message, sender) {
  const wasAtBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 1;
  const messageElement = document.createElement("p");

  if (sender === "self") {
    messageElement.textContent = `Você: ${message}`;
    messageElement.classList.add("message-self");
  } else if (sender === "stranger") {
    messageElement.textContent = `Estranho: ${message}`;
    messageElement.classList.add("message-stranger");
  } else {
    messageElement.textContent = message;
    messageElement.classList.add("message-system");
  }

  chatBox.appendChild(messageElement);
  if (wasAtBottom) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

// Play notification sound
function playNotificationSound() {
  const audio = new Audio("https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3");
  audio.volume = 0.5;
  audio.play();
}

// Typing Indicator
messageInput.oninput = () => {
  if (pairedUser) {
    socket.emit("typing", { to: pairedUser });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stop-typing", { to: pairedUser });
    }, 1000);
  }
};

socket.on("typing", () => {
  const existingIndicator = document.getElementById("typing-indicator");
  if (!existingIndicator) {
    const wasAtBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 1;
    const indicator = document.createElement("p");
    indicator.id = "typing-indicator";
    indicator.textContent = "Estranho está digitando...";
    chatBox.appendChild(indicator);
    if (wasAtBottom) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }
});

socket.on("stop-typing", () => {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) typingIndicator.remove();
});

// Emoji Picker
emojiBtn.onclick = () => {
  const existingPicker = document.querySelector("emoji-picker");
  if (existingPicker) {
    existingPicker.remove();
    return;
  }

  const picker = document.createElement("emoji-picker");
  picker.addEventListener("emoji-click", (event) => {
    messageInput.value += event.detail.emoji.unicode;
    messageInput.focus();
  });
  document.body.appendChild(picker);
};

// Video Controls
muteBtn.addEventListener("click", () => {
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const track = audioTracks[0];
      track.enabled = !track.enabled;
      isMuted = !track.enabled;

      const icon = muteBtn.querySelector("i");
      if (isMuted) {
        icon.classList.remove("fa-microphone");
        icon.classList.add("fa-microphone-slash");
        muteBtn.classList.add("btn-danger");
      } else {
        icon.classList.remove("fa-microphone-slash");
        icon.classList.add("fa-microphone");
        muteBtn.classList.remove("btn-danger");
      }
    }
  }
});

cameraBtn.addEventListener("click", () => {
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      const track = videoTracks[0];
      track.enabled = !track.enabled;
      isCameraOff = !track.enabled;

      const icon = cameraBtn.querySelector("i");
      if (isCameraOff) {
        icon.classList.remove("fa-video");
        icon.classList.add("fa-video-slash");
        cameraBtn.classList.add("btn-danger");
      } else {
        icon.classList.remove("fa-video-slash");
        icon.classList.add("fa-video");
        cameraBtn.classList.remove("btn-danger");
      }
    }
  }
});

videoFilter.addEventListener("change", () => {
  const filterValue = videoFilter.value;
  localVideo.style.filter = filterValue;
});

// Zoom controls
zoomInBtn.addEventListener("click", () => {
  if (zoomLevel < 2) {
    zoomLevel += 0.1;
    remoteVideo.style.transform = `scale(${zoomLevel})`;
  }
});

zoomOutBtn.addEventListener("click", () => {
  if (zoomLevel > 0.5) {
    zoomLevel -= 0.1;
    remoteVideo.style.transform = `scale(${zoomLevel})`;
  }
});

// Fullscreen functionality
fullscreenBtn.addEventListener("click", () => {
  const videoContainer = document.querySelector(".video-container");

  if (!isFullscreen) {
    // Enter fullscreen
    videoContainer.classList.add("fullscreen-video");

    // Change icon
    const icon = fullscreenBtn.querySelector("i");
    icon.classList.remove("fa-expand");
    icon.classList.add("fa-compress");

    isFullscreen = true;

    // Hide header, footer and sidebar when in fullscreen
    document.querySelector("header").style.display = "none";
    document.querySelector("footer").style.display = "none";
    document.querySelector(".col-md-4").style.display = "none";
    document.querySelector(".col-md-8").classList.remove("col-md-8");
    document.querySelector(".container").classList.add("container-fluid");
    document.querySelector(".container").classList.remove("container");

    // Add escape key listener
    document.addEventListener("keydown", exitFullscreenOnEsc);
  } else {
    // Exit fullscreen
    exitFullscreen();
  }
});

function exitFullscreenOnEsc(e) {
  if (e.key === "Escape" && isFullscreen) {
    exitFullscreen();
  }
}

function exitFullscreen() {
  const videoContainer = document.querySelector(".video-container");

  // Exit fullscreen
  videoContainer.classList.remove("fullscreen-video");

  // Change icon back
  const icon = fullscreenBtn.querySelector("i");
  icon.classList.remove("fa-compress");
  icon.classList.add("fa-expand");

  isFullscreen = false;

  // Show header, footer and sidebar again
  document.querySelector("header").style.display = "";
  document.querySelector("footer").style.display = "";
  document.querySelector(".col-md-4").style.display = "";
  document.querySelector(".container-fluid").classList.add("container");
  document.querySelector(".container-fluid").classList.remove("container-fluid");
  document.querySelector(".card").parentElement.classList.add("col-md-8");

  // Remove escape key listener
  document.removeEventListener("keydown", exitFullscreenOnEsc);
}

// Toggle HUD visibility
toggleHudBtn.addEventListener("click", () => {
  const videoContainer = document.querySelector(".video-container");

  if (!isHudHidden) {
    // Hide HUD
    videoContainer.classList.add("hidden-hud");

    // Change icon
    const icon = toggleHudBtn.querySelector("i");
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");

    isHudHidden = true;
  } else {
    // Show HUD
    videoContainer.classList.remove("hidden-hud");

    // Change icon back
    const icon = toggleHudBtn.querySelector("i");
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");

    isHudHidden = false;
  }
});

// Screen Sharing
shareScreenBtn.addEventListener("click", async () => {
  if (!screenSharingStream) {
    try {
      screenSharingStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

      // Replace video track with screen sharing track
      if (peerConnection && localStream) {
        const videoTrack = screenSharingStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");

        if (sender) {
          sender.replaceTrack(videoTrack);
        }

        // Show screen sharing in local video
        localVideo.srcObject = screenSharingStream;

        // Update button
        shareScreenBtn.innerHTML = '<i class="fas fa-desktop me-2"></i>Parar Compartilhamento';
        shareScreenBtn.classList.remove("btn-outline-secondary");
        shareScreenBtn.classList.add("btn-danger");

        // Handle when user stops screen sharing
        videoTrack.onended = () => {
          stopScreenSharing();
        };
      }
    } catch (error) {
      console.error("Error sharing screen:", error);
      showNotification("Erro ao compartilhar tela", "danger");
    }
  } else {
    stopScreenSharing();
  }
});

function stopScreenSharing() {
  if (screenSharingStream) {
    screenSharingStream.getTracks().forEach((track) => track.stop());

    // Replace with camera track again
    if (peerConnection && localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");

      if (sender && videoTrack) {
        sender.replaceTrack(videoTrack);
      }

      // Show camera in local video again
      localVideo.srcObject = localStream;
    }

    // Reset button
    shareScreenBtn.innerHTML = '<i class="fas fa-desktop me-2"></i>Compartilhar Tela';
    shareScreenBtn.classList.remove("btn-danger");
    shareScreenBtn.classList.add("btn-outline-secondary");

    screenSharingStream = null;
  }
}

// Snapshot functionality
snapshotBtn.addEventListener("click", () => {
  if (!remoteVideo.srcObject) {
    showNotification("Nenhum vídeo para capturar", "warning");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = remoteVideo.videoWidth;
  canvas.height = remoteVideo.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);

  const imageDataURL = canvas.toDataURL("image/png");

  // Show in modal
  const capturedImage = document.getElementById("captured-image");
  capturedImage.src = imageDataURL;

  const downloadLink = document.getElementById("download-image");
  downloadLink.href = imageDataURL;

  const imageModal = new bootstrap.Modal(document.getElementById("imagePreviewModal"));
  imageModal.show();
});

// Report functionality
submitReportBtn.addEventListener("click", () => {
  const selectedReason = document.querySelector('input[name="reportReason"]:checked');
  if (!selectedReason) {
    showNotification("Selecione um motivo para a denúncia", "warning");
    return;
  }

  const reason = selectedReason.value;
  const details = document.getElementById("reportDetails").value;

  // In a real app, you would send this to your server
  console.log("Report submitted:", { reason, details, reportedUser: pairedUser });

  showNotification("Denúncia enviada com sucesso", "success");

  // Reset form
  document.querySelector('input[name="reportReason"]:checked').checked = false;
  document.getElementById("reportDetails").value = "";
});

// Social Share Buttons
document.getElementById("share-twitter").addEventListener("click", () => {
  window.open(
    `https://twitter.com/intent/tweet?text=Estou%20usando%20OdysChat%20para%20conhecer%20pessoas%20novas!&url=${encodeURIComponent(window.location.href)}`
  );
});

document.getElementById("share-facebook").addEventListener("click", () => {
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`);
});

document.getElementById("share-whatsapp").addEventListener("click", () => {
  window.open(
    `https://api.whatsapp.com/send?text=Estou%20usando%20OdysChat%20para%20conhecer%20pessoas%20novas!%20${encodeURIComponent(window.location.href)}`
  );
});

// Notifications
function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.className = `alert alert-${type} notification`;
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.top = "20px";
  notification.style.right = "20px";
  notification.style.zIndex = "1000";
  notification.style.maxWidth = "300px";
  notification.style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
  notification.style.opacity = "1";

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500);
  }, 3000);
}

// Theme settings
document.getElementById("theme-select").addEventListener("change", function () {
  const theme = this.value;
  if (theme === "light") {
    document.body.classList.remove("dark-mode");
  } else if (theme === "dark") {
    document.body.classList.add("dark-mode");
  } else {
    // Auto - based on system preference
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }

  // Atualizar ícone
  const icon = themeToggle.querySelector("i");
  if (document.body.classList.contains("dark-mode")) {
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
  } else {
    icon.classList.remove("fa-sun");
    icon.classList.add("fa-moon");
  }

  // Atualizar cores dos elementos dinâmicos
  updateThemeColors();
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Start with text chat by default
  textChatBtn.click();

  // Set default settings
  document.getElementById("autoplay-sounds").checked = true;
  document.getElementById("show-typing").checked = true;

  // Check system theme preference
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.body.classList.add("dark-mode");
    const icon = themeToggle.querySelector("i");
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
  }

  // Atualizar cores dos elementos dinâmicos
  updateThemeColors();

  // Set initial icons for fullscreen and HUD toggle
  const fullscreenIcon = fullscreenBtn.querySelector("i");
  if (!fullscreenIcon.classList.contains("fa-expand")) {
    fullscreenIcon.classList.add("fa-expand");
  }

  const hudIcon = toggleHudBtn.querySelector("i");
  if (!hudIcon.classList.contains("fa-eye-slash")) {
    hudIcon.classList.add("fa-eye-slash");
  }
});