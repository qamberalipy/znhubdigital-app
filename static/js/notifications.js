let PAGE_SKIP = 0;
const PAGE_LIMIT = 15;
let CURRENT_FILTER = 'all'; // 'all', 'unread'
let IS_LOADING = false;
let HAS_MORE = true;

// Re-use the map from base.js, or define here if base.js isn't global enough
// Ideally base.js is loaded first, so we can access `notificationMap` if it was global.
// If not, we redefine strictly for this page.

$(document).ready(function() {
    loadPageNotifications(true);
});

function setFilter(filterType, btnElement) {
    if (IS_LOADING) return;
    
    // UI Update
    $("#notif-filters .nav-link").removeClass('active');
    $(btnElement).addClass('active');

    // Logic Update
    CURRENT_FILTER = filterType;
    PAGE_SKIP = 0;
    HAS_MORE = true;
    
    loadPageNotifications(true);
}

function refreshNotifications() {
    PAGE_SKIP = 0;
    HAS_MORE = true;
    loadPageNotifications(true);
}

function loadPageNotifications(reset = false) {
    if (IS_LOADING || !HAS_MORE) return;
    
    IS_LOADING = true;
    if (reset) {
        $("#full-notification-list").empty();
        $("#page-loader").show();
        $("#empty-state").hide();
        $("#btn-load-more").hide();
    } else {
        $("#btn-load-more").html('<span class="spinner-border spinner-border-sm" role="status"></span> Loading...');
    }

    // Build Query
    // Note: If you want to filter by 'critical', you might need to update your backend API 
    // to accept ?severity=critical. For now, we assume the backend supports 'filter=unread' or 'all'
    // If 'critical' is purely frontend, we might filter after fetch, but backend is better.
    // Assuming backend currently supports 'all' and 'unread':
    
    let apiFilter = (CURRENT_FILTER === 'unread') ? 'unread' : 'all';
    
    axios.get(`/api/notification/?limit=${PAGE_LIMIT}&skip=${PAGE_SKIP}&filter=${apiFilter}`)
        .then(res => {
            const data = res.data;
            const items = data.items || [];
            
            $("#page-loader").hide();
            
            if (reset && items.length === 0) {
                $("#empty-state").show();
                HAS_MORE = false;
            } else {
                // If we got fewer items than limit, we reached the end
                if (items.length < PAGE_LIMIT) HAS_MORE = false;
                
                // Render Items
                items.forEach(item => {
                    // Manual Client-side filter for 'Critical' if API doesn't support it yet
                    if (CURRENT_FILTER === 'critical' && item.severity !== 'critical') return;
                    
                    $("#full-notification-list").append(renderPageItem(item));
                });
                
                if (HAS_MORE) {
                    $("#btn-load-more").show().html('Load More <i class="ri-arrow-down-s-line"></i>');
                    PAGE_SKIP += PAGE_LIMIT;
                } else {
                    $("#btn-load-more").hide();
                }
            }
            
            // Update the sidebar badge
            if (data.total_unread !== undefined) {
                const badge = $("#page-unread-badge");
                badge.text(data.total_unread);
                data.total_unread > 0 ? badge.show() : badge.hide();
            }
        })
        .catch(err => {
            console.error("Error loading notifications", err);
            $("#page-loader").hide();
            showToastMessage('error', 'Failed to load notifications');
        })
        .finally(() => {
            IS_LOADING = false;
        });
}

function loadMoreNotifications() {
    loadPageNotifications(false);
}

function markAllAsReadPage() {
    axios.put('/api/notification/mark-all-read')
        .then(() => {
            // Visual Update: Remove unread styling
            $(".notification-page-item").removeClass('unread');
            $("#page-unread-badge").hide();
            showToastMessage('success', 'All marked as read');
            
            // Also update global badge in navbar
            if (typeof updateUnreadCount === 'function') updateUnreadCount(0, false);
        });
}

function renderPageItem(notif) {
    // Re-using the styling logic but for a bigger row
    const style = notificationMap[notif.category] || notificationMap['default'];
    const unreadClass = notif.is_read ? '' : 'unread';
    
    // Date Logic
    const dateObj = new Date(notif.created_at);
    const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const link = notif.click_action_link || '#';
    
    // Severity Badge
    let severityBadge = '';
    if (notif.severity === 'critical') severityBadge = '<span class="badge bg-soft-danger text-danger border border-danger-subtle ms-2">CRITICAL</span>';
    else if (notif.severity === 'high') severityBadge = '<span class="badge bg-soft-warning text-warning border border-warning-subtle ms-2">HIGH</span>';

    return `
    <li class="bor shadow-sm border-1 list-group-item my-1 notification-page-item p-4 rounded-3 ${unreadClass}">
        <div class="d-flex align-items-start">
            <div class="notif-icon-box ${style.bg} me-3" style="width: 48px; height: 48px; font-size: 1.4rem;">
                <i class="${style.icon}"></i>
            </div>
            
            <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1 fw-bold text-dark">
                            ${notif.title}
                            ${severityBadge}
                        </h6>
                        <p class="mb-1 text-muted">${notif.body || ''}</p>
                        <small class="text-muted opacity-75">
                            <i class="ri-time-line me-1"></i> ${dateStr}
                            <span class="mx-2">•</span>
                            <span class="text-uppercase" style="font-size: 0.7rem; letter-spacing: 0.5px;">${notif.category}</span>
                        </small>
                    </div>
                    
                    <div class="ms-3 d-flex flex-column align-items-end gap-2">
                        ${!notif.is_read ? 
                            `<button class="btn btn-sm btn-white border shadow-sm text-primary" onclick="markOneRead(${notif.id}, this)" title="Mark Read">
                                <i class="ri-checkbox-circle-line"></i>
                             </button>` : ''
                        }
                        <a href="${link}" class="btn btn-sm btn-light text-muted" title="View Details">
                            <i class="ri-arrow-right-line"></i>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </li>
    `;
}

function markOneRead(id, btn) {
    axios.put(`/api/notification/${id}/read`)
        .then(() => {
            $(btn).closest('.notification-page-item').removeClass('unread');
            $(btn).remove(); // Remove the button
            if (typeof updateUnreadCount === 'function') updateUnreadCount(-1, true);
        });
}