/**
 * task_submission.js
 * Logic for Digital Creators: View, Upload, Chat, Submit.
 * Fixes: Replaced inline JSON with stable ID-based lookup to prevent SyntaxErrors.
 * Updates: Added Pagination to Chat (Infinite Scroll).
 */

// --- Global State ---
let allTasks = []; // Holds the full task objects
let currentTask = null;
let newDeliverables = []; 
let activeChatTaskId = null;
let isChatSending = false;

// --- Chat Pagination State ---
let chatTopId = 0;    // ID of the oldest message currently in DOM
let chatBottomId = 0; // ID of the newest message currently in DOM
let isLoadingChat = false;

// Pagination & Filter State
let currentPage = 1;
let pageSize = 8; 
let totalTasks = 0;
let activeFilters = {
    search: '',
    status: ''
};

$(document).ready(function() {
    loadMyTasks();

    // --- Filter Events ---
    $("#filterStatus").on("change", function() {
        activeFilters.status = $(this).val();
        currentPage = 1; 
        loadMyTasks();
    });

    $("#filterSearch").on("keypress", function(e) {
        if(e.which === 13) { 
            activeFilters.search = $(this).val();
            currentPage = 1;
            loadMyTasks();
        }
    });

    // --- Pagination Events ---
    $("#btnPrevPage").on("click", function() {
        if (currentPage > 1) {
            currentPage--;
            loadMyTasks();
        }
    });
    $("#btnNextPage").on("click", function() {
        const maxPages = Math.ceil(totalTasks / pageSize);
        if (currentPage < maxPages) {
            currentPage++;
            loadMyTasks();
        }
    });

    // --- Upload & Actions ---
    $("#dropZone").on("click", function(e) {
        if (e.target.id !== 'fileInput') $("#fileInput").click();
    });
    $("#fileInput").on("click", (e) => e.stopPropagation());
    $("#fileInput").on("change", handleFileUpload);

    $("#btnSubmitWork").click(submitWork);
    
    // Chat Triggers
    $("#btnOpenChat").click(() => openChatModal(currentTask.id, currentTask.title));
    $("#chatForm").submit(sendMessage);
});

// ==========================================
// 1. DATA LOADING (Paginated)
// ==========================================

function loadMyTasks() {
    const grid = $("#taskGrid");
    grid.html('<div class="col-12 text-center py-5"><div class="spinner-border text-warning"></div></div>');
    
    const params = {
        skip: currentPage,
        Limit: pageSize
    };
    if (activeFilters.status) params.status = activeFilters.status;
    if (activeFilters.search) params.search = activeFilters.search;

    axios.get('/api/tasks/', { params: params })
        .then(res => {
            // Handle Paginated Response
            if (res.data.tasks) {
                totalTasks = res.data.total;
                allTasks = res.data.tasks; // Store global reference
                renderTasks(allTasks);
                updatePaginationUI();
            } else {
                // Fallback for legacy format
                allTasks = res.data;
                renderTasks(allTasks);
                $("#paginationInfo").text("Showing All");
            }
        })
        .catch(err => {
            console.error(err);
            grid.html('<div class="col-12 text-center text-danger mt-5">Failed to load tasks.</div>');
        });
}

function updatePaginationUI() {
    const maxPages = Math.ceil(totalTasks / pageSize) || 1;
    const start = (currentPage - 1) * pageSize + 1;
    let end = currentPage * pageSize;
    if (end > totalTasks) end = totalTasks;
    
    if (totalTasks === 0) {
        $("#paginationInfo").text("No tasks found");
    } else {
        $("#paginationInfo").text(`Showing ${start}-${end} of ${totalTasks}`);
    }

    $("#btnPrevPage").prop("disabled", currentPage === 1);
    $("#btnNextPage").prop("disabled", currentPage >= maxPages || totalTasks === 0);
}

function renderTasks(tasks) {
    const grid = $("#taskGrid");
    grid.empty();

    if (tasks.length === 0) {
        grid.html(`
            <div class="col-12 text-center text-muted mt-5 py-5">
                <i class="ri-checkbox-multiple-blank-line fs-1 opacity-25"></i>
                <h5 class="mt-3 fw-normal">No tasks found</h5>
                <p class="small">You are all caught up!</p>
            </div>
        `);
        return;
    }

    tasks.forEach(task => {
        // Map String Status to CSS Class
        let statusClass = "c-todo";
        let badgeClass = "badge-todo";
        
        if (task.status === "Completed") { statusClass = "c-completed"; badgeClass = "badge-completed"; }
        else if (task.status === "Blocked") { statusClass = "c-blocked"; badgeClass = "badge-blocked"; }
        else if (task.status === "Missed") { statusClass = "c-missed"; badgeClass = "badge-missed"; }

        // [FIXED] Pass ONLY the ID. No JSON.stringify issues.
        const card = `
            <div class="col-md-6 col-lg-4 col-xl-3">
                <div class="grail-card ${statusClass}" onclick="openTaskModal(${task.id})">
                    <div class="card-top">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="task-meta">${task.req_content_type}</span>
                            <span class="badge-status ${badgeClass}">${task.status}</span>
                        </div>
                        <h5 class="task-title text-truncate">${task.title}</h5>
                        <p class="task-desc">${task.description || 'No description provided.'}</p>
                        
                        <div class="d-flex gap-2 mt-3">
                            <span class="badge bg-light text-dark border fw-normal">
                                <i class="ri-calendar-event-line"></i> ${formatDateShort(task.due_date)}
                            </span>
                            ${task.priority === 'High' ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Urgent</span>' : ''}
                        </div>
                    </div>
                    <div class="card-btm">
                        <div class="d-flex align-items-center text-muted small">
                            <i class="ri-attachment-2 me-1"></i> ${task.attachments_count || 0} Files
                        </div>
                        <span class="text-warning small fw-bold">View Details <i class="ri-arrow-right-s-line"></i></span>
                    </div>
                </div>
            </div>
        `;
        grid.append(card);
    });
}

// ==========================================
// 2. MODAL LOGIC (ID-Based)
// ==========================================

function openTaskModal(taskId) {
    // [FIXED] Look up the full object from memory using the ID
    const task = allTasks.find(t => t.id === taskId);
    
    if (!task) {
        console.error("Task not found in memory:", taskId);
        return;
    }
    
    currentTask = task;
    newDeliverables = [];

    // --- Left Col: Details ---
    $("#modalTitle").text(task.title);
    
    // Description Logic
    const desc = task.description || "No description provided.";
    $("#modalDesc").text(desc);
    
    // Reset truncated view
    $("#modalDesc").addClass("desc-clamp");
    if (desc.length > 150) {
        $("#toggleDescBtn").removeClass("d-none").text("Read More");
    } else {
        $("#toggleDescBtn").addClass("d-none");
    }

    $("#modalQty").text(task.req_quantity);
    $("#modalDuration").text(task.req_duration_min ? task.req_duration_min + " mins" : "N/A");

    // Icons
    $("#modalFace").html(task.req_face_visible ? '<i class="ri-checkbox-circle-fill text-success"></i> Face' : '<i class="ri-close-circle-fill text-muted"></i> No Face');
    $("#modalWatermark").html(task.req_watermark ? '<i class="ri-checkbox-circle-fill text-success"></i> Watermark' : '<i class="ri-close-circle-fill text-muted"></i> No Watermark');

    // Tags
    const tagContainer = $("#modalTags");
    tagContainer.empty();
    if (task.req_outfit_tags) {
        task.req_outfit_tags.split(',').forEach(tag => {
            tagContainer.append(`<span class="badge bg-light border text-dark fw-normal me-1">${tag}</span>`);
        });
    } else {
         tagContainer.html('<small class="text-muted">No tags.</small>');
    }

    // References (Uploader != Me)
    const refContainer = $("#modalReferences");
    refContainer.empty();
    const myId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
    
    const references = (task.attachments || []).filter(a => a.uploader_id !== myId);
    
    if (references.length === 0) refContainer.html('<small class="text-muted">No reference files.</small>');
    
    references.forEach(file => {
        refContainer.append(`
            <div class="d-flex align-items-center border rounded p-2 mb-2 bg-white">
                <i class="ri-file-list-line fs-4 text-muted me-2"></i>
                <div class="flex-grow-1 text-truncate small fw-bold">
                    <a href="${file.file_url}" target="_blank" class="text-dark text-decoration-none">${getFileName(file.file_url)}</a>
                </div>
                <a href="${file.file_url}" target="_blank" class="text-primary"><i class="ri-download-line"></i></a>
            </div>
        `);
    });

    // --- Right Col: Submission State ---
    renderDeliverablesList();
    
    const btn = $("#btnSubmitWork");
    const alert = $("#statusAlert");
    const dropZone = $("#dropZone");
    
    if (task.status === "Completed") {
        alert.attr("class", "alert alert-success border-0 small").html('<i class="ri-check-double-line me-2"></i> <strong>Completed.</strong> Great work!');
        btn.prop("disabled", true).text("Task Completed");
        dropZone.addClass("d-none"); 
    } else if (task.status === "Blocked" || task.status === "Missed") {
        alert.attr("class", "alert alert-danger border-0 small").html(`<i class="ri-error-warning-line me-2"></i> <strong>${task.status}.</strong> Please contact your manager.`);
        btn.prop("disabled", true).text(task.status);
        dropZone.addClass("d-none");
    } else {
        // To Do
        alert.attr("class", "alert alert-warning border-0 small").html('<i class="ri-loader-4-line me-2"></i> <strong>Pending.</strong> Upload your work below.');
        btn.prop("disabled", false).text("Submit Work");
        dropZone.removeClass("d-none");
    }

    $("#submissionModal").modal("show");
}

function toggleDescription() {
    const el = $("#modalDesc");
    const btn = $("#toggleDescBtn");
    if (el.hasClass("desc-clamp")) {
        el.removeClass("desc-clamp");
        btn.text("Read Less");
    } else {
        el.addClass("desc-clamp");
        btn.text("Read More");
    }
}

function renderDeliverablesList() {
    const container = $("#deliverablesList");
    container.empty();
    
    const myId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
    
    // Existing files on server
    const existing = (currentTask.attachments || []).filter(a => a.uploader_id === myId);
    
    // Combined
    const allFiles = [
        ...existing.map(f => ({ ...f, isNew: false })), 
        ...newDeliverables.map(f => ({ ...f, isNew: true }))
    ];

    $("#fileCount").text(`${allFiles.length} Files`);

    if (allFiles.length === 0) {
        container.html('<div class="text-center text-muted small py-4">No deliverables uploaded yet.</div>');
        return;
    }

    allFiles.forEach((file, idx) => {
        const isImg = file.mime_type && file.mime_type.startsWith("image");
        const thumb = isImg ? (file.thumbnail_url || file.file_url) : null;
        const iconOrThumb = thumb ? `<img src="${thumb}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">` : `<div class="bg-light d-flex align-items-center justify-content-center rounded" style="width:40px;height:40px;"><i class="ri-file-line"></i></div>`;

        // Action logic: If new, remove from array. If existing, call API delete.
        const deleteAction = file.isNew ? `removeNewFile(${newDeliverables.indexOf(file)})` : `deleteExistingFile(${file.id})`;

        container.append(`
            <div class="d-flex align-items-center bg-white border rounded p-2 mb-2">
                <div class="me-2">${iconOrThumb}</div>
                <div class="flex-grow-1 overflow-hidden">
                    <div class="small fw-bold text-truncate">${file.tags || file.name || 'File'}</div>
                    <div class="text-xs text-muted">
                        ${file.file_size_mb ? file.file_size_mb + ' MB' : ''} 
                        ${file.isNew ? '<span class="text-success fw-bold ms-1">New</span>' : '<span class="text-secondary ms-1">Saved</span>'}
                    </div>
                </div>
                <button class="btn btn-sm btn-light text-danger border-0" onclick="${deleteAction}"><i class="ri-delete-bin-line"></i></button>
            </div>
        `);
    });
}

// ==========================================
// 3. UPLOAD & SUBMIT
// ==========================================

async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    const origText = $("#dropZone").html();
    $("#dropZone").html('<div class="spinner-border text-warning spinner-border-sm mb-2"></div><div class="small">Uploading...</div>');

    for (let file of files) {
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type_group", "image");

            const res = await axios.post('/api/upload/small-file', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.status === 'success') {
                newDeliverables.push({
                    file_url: res.data.url,
                    thumbnail_url: res.data.url, 
                    file_size_mb: (file.size / (1024*1024)).toFixed(2),
                    mime_type: file.type,
                    tags: file.name
                });
            }
        } catch (err) {
            toastr.error("Upload failed for " + file.name);
        }
    }

    $("#dropZone").html(origText);
    $("#fileInput").val(""); 
    renderDeliverablesList();
}

function removeNewFile(index) {
    newDeliverables.splice(index, 1);
    renderDeliverablesList();
}

function deleteExistingFile(contentId) {
    Swal.fire({
        title: 'Remove File?', text: "Delete from server?", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.delete(`/api/tasks/content/${contentId}`)
                .then(() => {
                    toastr.success("Removed");
                    // Update local state by filtering out deleted ID
                    currentTask.attachments = currentTask.attachments.filter(a => a.id !== contentId);
                    renderDeliverablesList();
                })
                .catch(() => toastr.error("Failed to delete"));
        }
    });
}

function submitWork() {
    const myId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
    const existingCount = (currentTask.attachments || []).filter(a => a.uploader_id === myId).length;

    if (newDeliverables.length === 0 && existingCount === 0) {
        toastr.warning("Please upload at least one file before submitting.");
        return;
    }

    const payload = { deliverables: newDeliverables }; 

    const btn = $("#btnSubmitWork");
    const origText = btn.html();
    btn.prop("disabled", true).html('<span class="spinner-border spinner-border-sm"></span> Submitting...');

    axios.post(`/api/tasks/${currentTask.id}/submit`, payload)
        .then(res => {
            toastr.success("Work Submitted!");
            $("#submissionModal").modal("hide");
            loadMyTasks(); 
        })
        .catch(err => {
            console.error(err);
            toastr.error("Submission failed");
        })
        .finally(() => {
            btn.prop("disabled", false).html(origText);
        });
}

// ==========================================
// 4. CHAT (Paginated)
// ==========================================

function openChatModal(id, title) {
    activeChatTaskId = id;
    
    // Reset State
    chatTopId = 0;
    chatBottomId = 0;
    $("#chatContainer").empty().html('<div class="text-center py-5"><div class="spinner-border text-secondary spinner-border-sm"></div></div>');
    
    // Bind Scroll Event for Pagination
    $("#chatContainer").off("scroll").on("scroll", function() {
        if ($(this).scrollTop() === 0 && !isLoadingChat) {
            loadChat(1); // Load Older
        }
    });

    $("#chatModal").modal("show");
    loadChat(0); // Initial Load
}

function loadChat(direction) {
    if (!activeChatTaskId) return;
    
    let params = { direction: direction };
    
    // Set cursor based on direction
    if (direction === 1) params.last_message_id = chatTopId; // Fetch older than top
    if (direction === 2) params.last_message_id = chatBottomId; // Fetch newer than bottom

    isLoadingChat = true;

    axios.get(`/api/tasks/${activeChatTaskId}/chat`, { params: params })
        .then(res => {
            const container = $("#chatContainer");
            const messages = res.data;

            // Handle Initial Load
            if (direction === 0) {
                container.empty();
                if (messages.length === 0) {
                    container.html('<div class="text-center text-muted small mt-5 opacity-50" id="noMsgInfo">No messages yet.<br>Start the conversation!</div>');
                    isLoadingChat = false;
                    return;
                }
            }
            
            // If no more old messages found
            if (direction === 1 && messages.length === 0) {
                isLoadingChat = false;
                return; // Stop trying to fetch
            }

            if (messages.length > 0) {
                // Update IDs
                if (direction === 0 || direction === 2) {
                    chatBottomId = messages[messages.length - 1].id;
                    if (direction === 0) chatTopId = messages[0].id;
                }
                if (direction === 1) {
                    chatTopId = messages[0].id;
                }

                renderMessages(messages, direction);
            }
        })
        .finally(() => {
            isLoadingChat = false;
        });
}

function renderMessages(messages, direction) {
    const container = $("#chatContainer");
    const myId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
    
    // Capture previous height for scroll adjustment (only for 'Older')
    const prevHeight = container[0].scrollHeight;

    let htmlBuffer = "";

    messages.forEach(msg => {
        if (msg.is_system_log) {
            htmlBuffer += `<div class="text-center my-3"><span class="badge bg-white border text-muted fw-normal rounded-pill px-3 py-1" style="font-size:0.7rem;">${msg.message}</span></div>`;
        } else {
            const isMe = msg.author.id === myId;
            htmlBuffer += `
                <div class="d-flex flex-column ${isMe ? 'align-items-end' : 'align-items-start'} mb-2 chat-msg-item" id="msg-${msg.id}">
                    ${!isMe ? `<span class="small fw-bold text-dark mb-1 ms-1">${msg.author.full_name || 'User'}</span>` : ''}
                    <div class="p-2 px-3 rounded-3 shadow-sm ${isMe ? 'bg-warning text-white' : 'bg-white border text-dark'}" 
                            style="${isMe ? 'background-color:#C89E47!important' : ''}; max-width: 85%;">
                        ${msg.message}
                    </div>
                    <span class="text-muted small mt-1 mx-1" style="font-size: 0.65rem;">${formatDateShort(msg.created_at)}</span>
                </div>
            `;
        }
    });

    if (direction === 1) {
        // Prepend (Older)
        container.prepend(htmlBuffer);
        // Restore scroll position
        container.scrollTop(container[0].scrollHeight - prevHeight);
    } else {
        // Append (Initial or Newer)
        container.append(htmlBuffer);
        // Scroll to bottom
        container.scrollTop(container[0].scrollHeight);
    }
}

function sendMessage(e) {
    e.preventDefault();
    const input = $("#chatInput");
    const txt = input.val().trim();
    if (!txt || isChatSending) return;

    isChatSending = true;
    const btn = $("#btnSendChat");
    btn.prop("disabled", true);
    $("#noMsgInfo").remove(); // Remove "No messages" text if it exists

    axios.post(`/api/tasks/${activeChatTaskId}/chat`, { message: txt })
        .then((res) => { 
            input.val(""); 
            // Append the single new message immediately
            renderMessages([res.data], 2); 
            // Update bottom ID
            chatBottomId = res.data.id;
        })
        .catch(() => toastr.error("Failed to send"))
        .finally(() => { 
            isChatSending = false; 
            btn.prop("disabled", false);
            setTimeout(() => input.focus(), 100); 
        });
}

// Helpers
function formatDateShort(str) { return str ? new Date(str).toLocaleDateString() : "-"; }
function getFileName(url) { return url ? url.split('/').pop() : "File"; }