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

    // FIX: Mute audio before unlocking so the user hears nothing on click
    notificationAudio.muted = true; 

    const playPromise = notificationAudio.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Immediately pause and reset
            notificationAudio.pause();
            notificationAudio.currentTime = 0;
            
            // FIX: Unmute it now so it's ready for real notifications
            notificationAudio.muted = false; 
            
            isAudioUnlocked = true;
            
            // Remove listeners so this doesn't run again
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

    // Listeners for the first interaction to unlock audio silently
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
        confirmButtonColor: '#C89E47', 
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
// 4. NOTIFICATION SYSTEM LOGIC
// ==================================================

let NOTIFICATION_SKIP = 0;
const NOTIFICATION_LIMIT = 10;
let NOTIFICATION_LOADING = false;
let wsConnection = null;

// UPDATED MAP: Using 'bg-soft-...' classes for the pastel look
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
    // Only play sound if enabled and unlocked
    if (isAudioUnlocked) {
        notificationAudio.currentTime = 0;
        notificationAudio.muted = false; // Ensure it's not muted from a glitch
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