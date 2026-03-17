/* static/js/base.js */

// ==================================================
// 1. GLOBAL AUDIO ENGINE (Silent Unlock Fix)
// ==================================================

const AUDIO_SRC = "https://pub-0bc0d3c98bb94e3a86698f0aa603f181.r2.dev/audio/mixkit-correct-answer-tone-2870.wav";
const notificationAudio = new Audio(AUDIO_SRC);
notificationAudio.volume = 0.5;

let isAudioUnlocked = false;

function unlockAudioEngine() {
    if (isAudioUnlocked) return;

    notificationAudio.muted = true; 

    const playPromise = notificationAudio.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            notificationAudio.pause();
            notificationAudio.currentTime = 0;
            notificationAudio.muted = false; 
            isAudioUnlocked = true;
            
            document.removeEventListener('click', unlockAudioEngine);
            document.removeEventListener('keydown', unlockAudioEngine);
        }).catch(error => {
            console.log("[Audio] Unlock waiting for interaction:", error);
        });
    }
}

// ==================================================
// 2. UI UTILITIES & GLOBAL SETUP
// ==================================================
$(document).ready(function () {
    if (typeof myhideLoader === 'function') myhideLoader();

    document.addEventListener('click', unlockAudioEngine, { once: true });
    document.addEventListener('keydown', unlockAudioEngine, { once: true });

    toastr.options = {
        "closeButton": true,
        "newestOnTop": true,
        "positionClass": "toast-top-right",
        "timeOut": "5000",
        "extendedTimeOut": "1000",
        "showEasing": "swing",
        "hideEasing": "linear",
        "showMethod": "fadeIn",
        "hideMethod": "fadeOut"
    };
    
    $(document).on("click", ".toggle-sidebar-btn", function () {
        $("body").toggleClass("toggle-sidebar");
    });

    initNotificationSystem();

    // --- NEW: CLOCK & SHIFT INIT ---
    setInterval(updateClock, 1000);
    updateClock();

    if ($('#btnShiftAction').length > 0) {
        checkShiftStatus();
    }
});

function myshowLoader() { $("#loader").fadeIn(200); }
function myhideLoader() { $("#loader").fadeOut(200); }

function showToastMessage(type, text) {
    switch (type) {
        case 'success': toastr.success(text); break;
        case 'info': toastr.info(text); break;
        case 'error': toastr.error(text); break;
        case 'warning': toastr.warning(text); break;
        default: toastr.info(text); break;
    }
}

function handleLogout() {
    Swal.fire({
        title: 'Sign Out?',
        text: "You will need to login again to access your account.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2563EB', // Updated to ZN Blue 
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, Log out'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.post('/api/auth/logout')
                .then(() => { window.location.href = "/"; })
                .catch(err => {
                    console.error("Logout failed", err);
                    window.location.href = "/";
                });
        }
    });
}

if (typeof axios !== 'undefined') {
    axios.interceptors.response.use(
        response => response,
        error => {
            if (error.response && error.response.status === 401) {
                window.location.href = "/"; 
            }
            return Promise.reject(error);
        }
    );
}

// ==================================================
// 3. NOTIFICATION SYSTEM LOGIC
// ==================================================

let NOTIFICATION_SKIP = 0;
const NOTIFICATION_LIMIT = 10;
let NOTIFICATION_LOADING = false;
let wsConnection = null;

const notificationMap = {
    'task':     { icon: 'ri-clipboard-line', bg: 'bg-soft-primary' },   
    'invoice':  { icon: 'ri-file-list-3-line', bg: 'bg-soft-success' }, 
    'approval': { icon: 'ri-checkbox-circle-line', bg: 'bg-soft-warning' }, 
    'critical': { icon: 'ri-alarm-warning-fill', bg: 'bg-soft-danger' },    
    'system':   { icon: 'ri-settings-4-line', bg: 'bg-soft-secondary' },  
    'announcement': { icon: 'ri-megaphone-line', bg: 'bg-soft-info' },    
    'default':  { icon: 'ri-notification-badge-line', bg: 'bg-soft-secondary' }
};

function initNotificationSystem() {
    fetchNotifications(true);
    connectWebSocket();
}

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/notification/ws`;

    if (wsConnection) wsConnection.close();

    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = function() { };

    wsConnection.onmessage = function(event) {
        try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'new_notification' && payload.data) {
                handleRealTimeNotification(payload.data);
            }
        } catch (e) { console.error("WS Parse Error", e); }
    };

    wsConnection.onclose = function(e) {
        setTimeout(() => connectWebSocket(), 5000);
    };

    wsConnection.onerror = function(err) {
        console.error("WS Error:", err);
    };
}

function fetchNotifications(reset = false) {
    if (NOTIFICATION_LOADING) return;
    NOTIFICATION_LOADING = true;

    if (reset) {
        NOTIFICATION_SKIP = 0;
        $("#notification-list").empty();
    }

    axios.get(`/api/notification/?limit=${NOTIFICATION_LIMIT}&skip=${NOTIFICATION_SKIP}`)
        .then(res => {
            let items = res.data.items || res.data; 
            if (!Array.isArray(items) && res.data.data) items = res.data.data;
            if (!Array.isArray(items)) items = []; 

            if (res.data.total_unread !== undefined) updateUnreadCount(res.data.total_unread, false);
            else fetchUnreadCount(); 

            const listContainer = $("#notification-list");
            if (reset) listContainer.empty();

            if (items.length === 0 && NOTIFICATION_SKIP === 0) {
                listContainer.html(`<li class="d-flex flex-column align-items-center justify-content-center py-5 text-muted"><i class="ri-notification-off-line fs-3 mb-2"></i><small>No new notifications</small></li>`);
                $("#notification-footer").hide();
            } else {
                items.forEach(item => listContainer.append(renderNotificationItem(item)));
                $("#notification-footer").show();
                NOTIFICATION_SKIP += NOTIFICATION_LIMIT;
            }
        })
        .finally(() => { NOTIFICATION_LOADING = false; });
}

function fetchUnreadCount() {
    axios.get('/api/notification/unread-count')
        .then(res => updateUnreadCount(res.data.count, false));
}

function renderNotificationItem(notif) {
    const style = notificationMap[notif.category] || notificationMap['default'];
    const unreadClass = notif.is_read ? '' : 'unread';
    
    let dateStr = "Just now";
    if (notif.created_at) {
        const dateObj = new Date(notif.created_at);
        const now = new Date();
        const diffMs = now - dateObj;
        if (diffMs < 60000) dateStr = "Just now";
        else if (diffMs < 3600000) dateStr = `${Math.floor(diffMs/60000)} min ago`;
        else if (diffMs < 86400000) dateStr = `${Math.floor(diffMs/3600000)} hr ago`;
        else dateStr = dateObj.toLocaleDateString();
    }

    const linkUrl = notif.click_action_link || '#';

    let severityBadge = '';
    const sev = (notif.severity || 'normal').toLowerCase();
    if (sev === 'critical') {
        severityBadge = `<span class="severity-badge severity-critical me-2">Critical</span>`;
    } else if (sev === 'high') {
        severityBadge = `<span class="severity-badge severity-high me-2">High</span>`;
    }

    return `
    <li class="position-relative" id="notif-${notif.id}">
        <a href="javascript:void(0)" 
           class="notification-item shadow-sm m-1 rounded-3 ${unreadClass}"
           onclick="handleNotificationClick(${notif.id}, '${linkUrl}')">
            
            <div class="notif-icon-box ${style.bg}">
                <i class="${style.icon}"></i>
            </div>
            
            <div class="flex-grow-1" style="min-width: 0;">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <h6 class="notif-title text-truncate">${notif.title}</h6>
                </div>
                <p class="notif-body">${notif.body || 'No details.'}</p>
                <div class="notif-meta mt-2">
                    ${severityBadge}
                    <i class="ri-time-line" style="font-size: 10px;"></i>
                    <span>${dateStr}</span>
                </div>
            </div>
        </a>
    </li>`;
}

function handleRealTimeNotification(data) {
    if (isAudioUnlocked) {
        notificationAudio.currentTime = 0;
        notificationAudio.muted = false; 
        notificationAudio.play().catch(e => console.warn("Audio play prevented:", e));
    }

    const severity = (data.severity || 'normal').toLowerCase();
    if (severity === 'critical') toastr.error(data.body, data.title);
    else if (severity === 'high') toastr.warning(data.body, data.title);
    else toastr.success(data.body, data.title);

    updateUnreadCount(1, true);

    const tempItem = {
        id: data.id,
        title: data.title,
        body: data.body,
        category: data.category || 'system',
        severity: data.severity,
        click_action_link: data.click_action_link, 
        is_read: false,
        created_at: data.created_at || new Date().toISOString()
    };
    
    const list = $("#notification-list");
    if (list.find('.ri-notification-off-line').length > 0) {
        list.empty();
        $("#notification-footer").show();
    }
    list.prepend(renderNotificationItem(tempItem));
}

function handleNotificationClick(id, link) {
    axios.put(`/api/notification/${id}/read`)
        .then(() => {
            if (link && link !== 'null' && link !== '#' && link !== 'undefined') window.location.href = link;
            else {
                $(`#notif-${id} .notification-item`).removeClass('unread');
                updateUnreadCount(-1, true);
            }
        })
        .catch(() => {
            if (link && link !== 'null' && link !== '#') window.location.href = link;
        });
}

function markAllAsRead(e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    axios.put('/api/notification/mark-all-read')
        .then(() => {
            $("#notification-list .notification-item").removeClass('unread');
            updateUnreadCount(0, false);
            showToastMessage('success', 'All marked as read');
        });
}

function updateUnreadCount(val, isRelative) {
    const badge = $("#notification-badge");
    const textBadge = $("#notification-count-text");
    let current = parseInt(badge.text()) || 0;
    let newVal = isRelative ? (current + val) : val;
    if (newVal < 0) newVal = 0;

    badge.text(newVal);
    textBadge.text(newVal);

    if (newVal > 0) {
        badge.show();
        textBadge.show();
        badge.addClass('animate__animated animate__pulse'); 
    } else {
        badge.hide();
        textBadge.hide();
    }
}

function viewAllNotifications() {
    window.location.href = "/notifications";
}


// ==================================================
// 4. HEADER CLOCK & SHIFT TRACKER LOGIC
// ==================================================

let shiftTimerInterval = null; // Store the interval ID globally

function updateClock() {
    const now = new Date();
    // Use 12-hour format for the time
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    // Clean date string (e.g., "Wed, Oct 25")
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    $('#live-time').text(timeStr);
    $('#live-date').text(dateStr);
}

function checkShiftStatus() {
    axios.get('/api/users/shift/status')
        .then(res => {
            // Pass the start_time from the backend to the UI updater
            updateShiftButtonUI(res.data.is_active, res.data.start_time);
        })
        .catch(err => {
            console.error("Failed to load shift status", err);
            $('#btnShiftAction').text('Shift Error').prop('disabled', true).show();
        });
}

function startShiftTimer(startTimeIso) {
    // Ensure the UTC time from FastAPI is converted to a timestamp
    const startTimeMs = new Date(startTimeIso).getTime();

    function updateTimer() {
        const nowMs = new Date().getTime();
        const diffMs = nowMs - startTimeMs;

        if (diffMs < 0) return; // Prevent negative jumps

        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');

        // Update the span inside the button dynamically
        $('#shiftTimerText').text(`End Shift (${hours}:${minutes}:${seconds})`);
    }

    updateTimer(); // Fire immediately so there is no 1-second delay
    shiftTimerInterval = setInterval(updateTimer, 1000);
}

function updateShiftButtonUI(isActive, startTime = null) {
    const btn = $('#btnShiftAction');
    const stateInput = $('#currentShiftState');
    
    // Clear any existing timer loops
    if (shiftTimerInterval) {
        clearInterval(shiftTimerInterval);
        shiftTimerInterval = null;
    }
    
    // Reset properties
    btn.prop('disabled', false).show();
    
    if (isActive) {
        // Active Shift: Red End Button + Timer Span
        btn.css({'background-color': '#DC2626', 'color': 'white'}); 
        btn.html('<i class="ri-stop-circle-fill fs-5"></i> <span class="d-none d-md-inline" id="shiftTimerText">End Shift</span>');
        stateInput.val('active');
        
        // Start the live counter
        if (startTime) {
            startShiftTimer(startTime);
        }
    } else {
        // No Shift: ZN Blue Start Button
        btn.css({'background-color': '#2563EB', 'color': 'white'}); 
        btn.html('<i class="ri-play-circle-fill fs-5"></i> <span class="d-none d-md-inline">Start Shift</span>');
        stateInput.val('inactive');
    }
}

function toggleShift() {
    const state = $('#currentShiftState').val();
    const btn = $('#btnShiftAction');
    
    // Put button into loading state to prevent double clicks
    btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span>');

    if (state === 'inactive') {
        axios.post('/api/users/shift/start')
            .then(res => {
                showToastMessage('success', 'Shift Started! Get to work.');
                // Pass the fresh start time returned by the API to immediately start counting
                updateShiftButtonUI(true, res.data.start_time);
            })
            .catch(err => {
                showToastMessage('error', err.response?.data?.detail || 'Failed to start shift');
                updateShiftButtonUI(false);
            });
            
    } else if (state === 'active') {
        Swal.fire({
            title: 'End Shift?',
            text: "Are you sure you want to clock out?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#DC2626',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'Yes, Clock out'
        }).then((result) => {
            if (result.isConfirmed) {
                // Instantly freeze the timer visually so it stops ticking while waiting for API
                if (shiftTimerInterval) clearInterval(shiftTimerInterval);

                axios.post('/api/users/shift/end')
                    .then(res => {
                        const hours = res.data.total_hours;
                        Swal.fire('Shift Ended', `You worked for ${hours} hours today.`, 'success');
                        updateShiftButtonUI(false);
                    })
                    .catch(err => {
                        showToastMessage('error', err.response?.data?.detail || 'Failed to end shift');
                        // If it fails, restart the UI and timer based on the original status
                        checkShiftStatus(); 
                    });
            } else {
                // User canceled the sweetalert, put the UI back to active and keep timer running
                checkShiftStatus(); 
            }
        });
    }
}