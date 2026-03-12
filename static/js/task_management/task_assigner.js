/**
 * task_assigner.js
 * Features: Pagination, Filters, "Me" Logic, Chat, CRUD.
 * Updated: Chat Pagination added to match task_submission.js
 */

// --- Global State ---
let taskTags = [];           
let newAttachments = [];     
let existingAttachments = [];
let activeChatTaskId = null;
let currentAssignees = [];
let isChatSending = false;
let currentReviewTask = null;

// --- Chat Pagination State ---
let chatTopId = 0;    
let chatBottomId = 0; 
let isLoadingChat = false;

// Pagination & Filters State
let currentPage = 1;
let pageSize = 10;
let totalTasks = 0;
let activeFilters = {
    search: '',
    status: '',
    assignee_id: ''
};

$(document).ready(function() {
    loadAssignees();
    loadTasks();

    // --- Event Listeners ---
    
    // 1. Tag System
    $("#tagContainer").on("click", function() { $("#tagInput").focus(); });
    $("#tagInput").on("keydown", handleTagInput);

    // 2. Priority Toggle
    $(".priority-option").on("click", function() {
        $(".priority-option").removeClass("active");
        $(this).addClass("active");
        $("#taskPriority").val($(this).data("value"));
    });

    // 3. File Upload
    $("#uploadZone").on("click", function(e) {
        if (e.target.id !== 'fileInput') $("#fileInput").click(); 
    });
    $("#fileInput").on("click", (e) => e.stopPropagation());
    $("#fileInput").on("change", handleFileUpload);

    // 4. Form Submit
    $("#taskForm").on("submit", handleTaskSubmit);

    // 5. Chat Submit
    $("#chatForm").on("submit", sendMessage);
    
    // 6. Review Modal Chat Button
    $("#btnReviewChat").on("click", function() {
        if(currentReviewTask) {
            $("#reviewModal").modal("hide");
            openChatModal(currentReviewTask.id, currentReviewTask.title);
        }
    });

    // 7. Filters & Search
    $("#filterStatus").on("change", function() {
        activeFilters.status = $(this).val();
        currentPage = 1; 
        loadTasks();
    });
    
    $("#filterAssignee").on("change", function() {
        activeFilters.assignee_id = $(this).val();
        currentPage = 1;
        loadTasks();
    });

    $("#filterSearch").on("keypress", function(e) {
        if(e.which === 13) { 
            activeFilters.search = $(this).val();
            currentPage = 1;
            loadTasks();
        }
    });

    // 8. Pagination Buttons
    $("#btnPrevPage").on("click", function() {
        if (currentPage > 1) {
            currentPage--;
            loadTasks();
        }
    });
    $("#btnNextPage").on("click", function() {
        const maxPages = Math.ceil(totalTasks / pageSize);
        if (currentPage < maxPages) {
            currentPage++;
            loadTasks();
        }
    });
});

// ==========================================
// 1. DATA LOADING
// ==========================================

function loadAssignees() {
    axios.get('/api/tasks/assignees')
        .then(res => {
            currentAssignees = res.data;
            const modalSelect = $("#assigneeSelect");
            const filterSelect = $("#filterAssignee");

            modalSelect.empty().append('<option value="" disabled selected>Select Creator...</option>');
            filterSelect.empty().append('<option value="">All Assignees</option>');

            if (currentAssignees.length === 0) {
                modalSelect.append('<option disabled>No creators found</option>');
            }
            
            currentAssignees.forEach(u => {
                const name = u.full_name || u.username;
                modalSelect.append(`<option value="${u.id}">${name}</option>`);
                filterSelect.append(`<option value="${u.id}">${name}</option>`);
            });
        })
        .catch(err => console.error("Assignees Error:", err));
}

function loadTasks() {
    const tbody = $("#taskTableBody");
    tbody.html(`<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-warning"></div></td></tr>`);
    
    const params = { skip: currentPage, limit: pageSize };
    if (activeFilters.search) params.search = activeFilters.search;
    if (activeFilters.status) params.status = activeFilters.status;
    if (activeFilters.assignee_id) params.assignee_id = activeFilters.assignee_id;

    axios.get('/api/tasks/', { params: params })
        .then(res => {
            if (res.data.tasks) {
                totalTasks = res.data.total;
                renderTable(res.data.tasks);
                updatePaginationUI();
            } else {
                renderTable(res.data);
                $("#paginationInfo").text("Showing All");
            }
        })
        .catch(err => {
            console.error("Load Tasks Error:", err);
            tbody.html(`<tr><td colspan="7" class="text-center text-danger py-4">Failed to load tasks.</td></tr>`);
        });
}

function updatePaginationUI() {
    const maxPages = Math.ceil(totalTasks / pageSize) || 1;
    const start = (currentPage - 1) * pageSize + 1;
    let end = currentPage * pageSize;
    if (end > totalTasks) end = totalTasks;
    
    if (totalTasks === 0) {
        $("#paginationInfo").text("No records found");
    } else {
        $("#paginationInfo").text(`Showing ${start}-${end} of ${totalTasks}`);
    }

    $("#btnPrevPage").prop("disabled", currentPage === 1);
    $("#btnNextPage").prop("disabled", currentPage >= maxPages || totalTasks === 0);
}

function renderTable(tasks) {
    const tbody = $("#taskTableBody");
    tbody.empty();

    if (tasks.length === 0) {
        tbody.html(`<tr><td colspan="7" class="text-center text-muted py-5">No tasks match your criteria.</td></tr>`);
        return;
    }

    tasks.forEach(task => {
        let badgeClass = 'badge-todo';
        if (task.status === 'Completed') badgeClass = 'badge-completed';
        if (task.status === 'Blocked') badgeClass = 'badge-blocked';
        if (task.status === 'Missed') badgeClass = 'badge-missed';

        const assigneeName = task.assignee ? (task.assignee.full_name || task.assignee.username) : 'Unknown';
        const assigneePic = task.assignee?.profile_picture_url || `https://ui-avatars.com/api/?name=${assigneeName}&background=random`;

        let assignerDisplay = task.assigner ? (task.assigner.full_name || task.assigner.username) : 'Unknown';
        let assignerRole = task.assigner ? task.assigner.role : '';
        
        if (task.is_created_by_me) {
            assignerDisplay = `<span class="fw-bold text-dark">Me</span>`;
        } else {
            assignerDisplay = `<span class="fw-bold text-dark">${assignerDisplay}</span>`;
        }

        let actionButtons = '';
        if (task.status === 'Completed') {
            actionButtons = `
                <i class="ri-eye-line action-icon me-2 text-success" title="Review" onclick="openReviewModal(${task.id})"></i>
                <i class="ri-message-3-line action-icon me-2 text-primary" title="Chat (${task.chat_count})" onclick="openChatModal(${task.id}, '${task.title}')"></i>
                <i class="ri-delete-bin-line action-icon delete" title="Delete" onclick="deleteTask(${task.id})"></i>
            `;
        } else {
            actionButtons = `
                <i class="ri-message-3-line action-icon me-2 text-primary" title="Chat (${task.chat_count})" onclick="openChatModal(${task.id}, '${task.title}')"></i>
                <i class="ri-pencil-line action-icon me-2" title="Edit" onclick="openEditModal(${task.id})"></i>
                <i class="ri-delete-bin-line action-icon delete" title="Delete" onclick="deleteTask(${task.id})"></i>
            `;
        }

        const row = `
            <tr>
                <td>
                    <div class="d-flex flex-column">
                        <span class="fw-bold text-dark text-truncate" style="max-width: 200px;">${task.title}</span>
                        <div class="d-flex gap-2 mt-1">
                            <span class="badge bg-light text-dark border fw-normal" style="font-size:0.7rem;">${task.req_content_type}</span>
                            <span class="text-xs text-muted"><i class="ri-attachment-line"></i> ${task.attachments_count || 0}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${assigneePic}" class="user-avatar-small" alt="u">
                        <span class="small fw-medium text-dark">${assigneeName}</span>
                    </div>
                </td>
                <td>
                    <div class="d-flex flex-column">
                        ${assignerDisplay}
                        <span class="text-xs text-muted" style="font-size: 0.75rem;">${assignerRole}</span>
                    </div>
                </td>
                <td><span class="small text-muted">${task.context}</span></td>
                <td><span class="badge-status ${badgeClass}">${task.status}</span></td>
                <td><span class="small text-dark">${formatDate(task.due_date)}</span></td>
                <td class="text-end">
                    ${actionButtons}
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// ==========================================
// 2. MODAL & FORM LOGIC
// ==========================================

function openCreateTaskModal() {
    resetForm();
    $("#taskId").val(""); 
    $("#taskModalLabel").text("Create Assignment");
    $("#btnSaveTask").text("Confirm Assignment");
    $("#taskModal").modal("show");
}

function openEditModal(id) {
    if ($("#loader").length) $("#loader").show();
    axios.get(`/api/tasks/${id}`)
        .then(res => {
            if ($("#loader").length) $("#loader").hide();
            populateForm(res.data);
            $("#taskModal").modal("show");
        })
        .catch(err => {
            if ($("#loader").length) $("#loader").hide();
            toastr.error("Failed to fetch task details");
        });
}

function openReviewModal(id) {
    if ($("#loader").length) $("#loader").show();
    axios.get(`/api/tasks/${id}`)
        .then(res => {
            if ($("#loader").length) $("#loader").hide();
            currentReviewTask = res.data;
            
            $("#reviewTaskTitle").text(currentReviewTask.title);
            $("#reviewAssigneeName").text(currentReviewTask.assignee.full_name || currentReviewTask.assignee.username);
            
            const assigneeId = currentReviewTask.assignee.id;
            const deliverables = currentReviewTask.attachments.filter(a => a.uploader_id === assigneeId);
            
            $("#reviewFileCount").text(`${deliverables.length} Files`);
            const container = $("#reviewDeliverablesList");
            container.empty();
            
            if (deliverables.length === 0) {
                $("#reviewEmptyState").removeClass("d-none");
            } else {
                $("#reviewEmptyState").addClass("d-none");
                deliverables.forEach(file => {
                     const isImg = file.mime_type && file.mime_type.startsWith("image");
                     const thumb = isImg ? (file.thumbnail_url || file.file_url) : null;
                     const iconHtml = !thumb ? `<div class="d-flex align-items-center justify-content-center bg-light" style="height:160px; border-radius:8px 8px 0 0; border-bottom:1px solid #eee;">${getIconForMime(file.mime_type)}</div>` : `<img src="${thumb}" class="review-thumb">`;

                     container.append(`
                        <div class="col-6 col-md-4">
                            <div class="deliverable-card">
                                ${iconHtml}
                                <div class="p-3">
                                    <div class="small fw-bold text-truncate mb-1" title="${file.tags}">${file.tags || 'File'}</div>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <span class="text-xs text-muted">${file.file_size_mb} MB</span>
                                        <a href="${file.file_url}" target="_blank" class="btn btn-sm btn-light border" title="Download">
                                            <i class="ri-download-line"></i>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                     `);
                });
            }
            $("#reviewModal").modal("show");
        })
        .catch(err => {
            if ($("#loader").length) $("#loader").hide();
            toastr.error("Failed to load submission");
        });
}

function resetForm() {
    $("#taskForm")[0].reset();
    $("#filePreviewList").empty();
    taskTags = [];
    newAttachments = [];
    existingAttachments = [];
    renderTags();
    
    $(".priority-option").removeClass("active");
    $(`.priority-option[data-value="Low"]`).addClass("active");
    $("#taskPriority").val("Low");
    $("#uploadText").removeClass("d-none");
    $("#uploadSpinner").addClass("d-none");
}

function populateForm(task) {
    resetForm();
    $("#taskId").val(task.id);
    $("#taskTitle").val(task.title);
    
    if ($(`#assigneeSelect option[value='${task.assignee.id}']`).length > 0) {
        $("#assigneeSelect").val(task.assignee.id);
    } else {
        $("#assigneeSelect").append(`<option value="${task.assignee.id}" selected>${task.assignee.full_name} (Linked)</option>`);
    }

    $("#taskDescription").val(task.description);
    $("#taskContext").val(task.context);
    $("#contentType").val(task.req_content_type);
    $("#reqQuantity").val(task.req_quantity || 1);
    $("#reqDuration").val(task.req_duration_min || "");
    
    $(".priority-option").removeClass("active");
    $(`.priority-option[data-value="${task.priority}"]`).addClass("active");
    $("#taskPriority").val(task.priority);

    $("#reqFace").prop("checked", task.req_face_visible);
    $("#reqWatermark").prop("checked", task.req_watermark);

    if (task.due_date) {
        const d = new Date(task.due_date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        $("#dueDate").val(d.toISOString().slice(0, 16));
    }

    if (task.req_outfit_tags) {
        taskTags = task.req_outfit_tags.split(',').filter(t => t);
        renderTags();
    }

    existingAttachments = task.attachments || []; 
    renderAllAttachments(); 

    $("#taskModalLabel").text("Edit Assignment");
    $("#btnSaveTask").text("Update Assignment");
}

// ==========================================
// 3. TAGS & ATTACHMENTS
// ==========================================
function handleTagInput(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        const val = $(this).val().trim();
        if (val && !taskTags.includes(val)) {
            taskTags.push(val); renderTags();
        }
        $(this).val("");
    } else if (e.key === "Backspace" && $(this).val() === "") {
        taskTags.pop(); renderTags();
    }
}
function renderTags() {
    $(".tag-chip").remove();
    taskTags.forEach((tag, index) => {
        $(`<div class="tag-chip"><span>${tag}</span><i class="ri-close-line" onclick="removeTag(${index})"></i></div>`).insertBefore("#tagInput");
    });
}
function removeTag(index) { taskTags.splice(index, 1); renderTags(); }

async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;
    $("#uploadText").addClass("d-none");
    $("#uploadSpinner").removeClass("d-none");

    for (let file of files) {
        try {
            const thumbData = await generateThumbnail(file);
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type_group", "image"); 
            const res = await axios.post('/api/upload/small-file', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
            if (res.data.status === 'success') {
                let finalThumb = file.type.startsWith("image") ? res.data.url : thumbData;
                newAttachments.push({
                    file_url: res.data.url, thumbnail_url: finalThumb, 
                    file_size_mb: (file.size / (1024*1024)).toFixed(2), mime_type: file.type, tags: file.name
                });
            }
        } catch (err) { toastr.error(`Failed to upload ${file.name}`); }
    }
    $("#uploadText").removeClass("d-none");
    $("#uploadSpinner").addClass("d-none");
    $("#fileInput").val(""); 
    renderAllAttachments();
}

function renderAllAttachments() {
    const container = $("#filePreviewList");
    container.empty();
    existingAttachments.forEach(file => {
        const icon = getIconForMime(file.mime_type);
        const thumb = (file.mime_type && file.mime_type.startsWith("image")) ? file.file_url : icon;
        container.append(`
            <div class="file-preview-item bg-light border-0">
                ${(file.mime_type && file.mime_type.startsWith("image")) ? `<img src="${thumb}" class="preview-thumb">` : `<div class="preview-icon">${icon}</div>`}
                <div class="flex-grow-1 overflow-hidden">
                    <div class="small fw-bold text-truncate">Existing File</div>
                    <div class="text-xs text-muted"><a href="${file.file_url}" target="_blank" class="text-decoration-none">View</a></div>
                </div>
            </div>`);
    });
    newAttachments.forEach((file, index) => {
        const icon = getIconForMime(file.mime_type);
        const thumb = file.mime_type.startsWith("image") ? file.thumbnail_url : icon;
        container.append(`
            <div class="file-preview-item">
                ${file.mime_type.startsWith("image") ? `<img src="${thumb}" class="preview-thumb">` : `<div class="preview-icon">${icon}</div>`}
                <div class="flex-grow-1 overflow-hidden">
                    <div class="small fw-bold text-truncate">${file.tags}</div>
                    <div class="text-xs text-muted">${file.file_size_mb} MB</div>
                </div>
                <i class="ri-close-circle-fill text-danger fs-5" style="cursor:pointer" onclick="removeNewAttachment(${index})"></i>
            </div>`);
    });
}
function removeNewAttachment(index) { newAttachments.splice(index, 1); renderAllAttachments(); }

// Helpers
function generateThumbnail(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const maxSize = 100;
                    let w = img.width, h = img.height;
                    if (w > h) { if (w > maxSize) { h *= maxSize/w; w=maxSize; }}
                    else { if (h > maxSize) { w *= maxSize/h; h=maxSize; }}
                    canvas.width = w; canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL("image/jpeg", 0.7));
                };
            };
            reader.readAsDataURL(file);
        } else { resolve(null); }
    });
}
function getIconForMime(mime) {
    if (!mime) return '<i class="ri-file-line"></i>';
    if (mime.includes("video")) return '<i class="ri-movie-line"></i>';
    if (mime.includes("pdf")) return '<i class="ri-file-pdf-line"></i>';
    return '<i class="ri-file-list-2-line"></i>';
}

// ==========================================
// 4. CRUD ACTIONS
// ==========================================

function handleTaskSubmit(e) {
    e.preventDefault();
    if (!$("#taskTitle").val()) { toastr.warning("Title is required"); return; }
    if (!$("#assigneeSelect").val()) { toastr.warning("Please select an assignee"); return; }

    const taskId = $("#taskId").val();
    const isEdit = !!taskId;

    const payload = {
        title: $("#taskTitle").val(),
        description: $("#taskDescription").val(),
        assignee_id: parseInt($("#assigneeSelect").val()),
        req_content_type: $("#contentType").val(),
        req_quantity: parseInt($("#reqQuantity").val()) || 1,
        req_duration_min: parseInt($("#reqDuration").val()) || 0,
        req_outfit_tags: taskTags,
        req_face_visible: $("#reqFace").is(":checked"),
        req_watermark: $("#reqWatermark").is(":checked"),
        priority: $("#taskPriority").val(),
        context: $("#taskContext").val()
    };
    if ($("#dueDate").val()) payload.due_date = new Date($("#dueDate").val()).toISOString();

    const btn = $("#btnSaveTask");
    const origText = btn.text();
    btn.prop("disabled", true).html('<span class="spinner-border spinner-border-sm"></span> Saving...');

    let promise;
    if (isEdit) {
        if (newAttachments.length > 0) toastr.info("New files ignored in Edit. Use Chat.");
        promise = axios.put(`/api/tasks/${taskId}`, payload);
    } else {
        payload.attachments = newAttachments;
        promise = axios.post('/api/tasks/', payload);
    }

    promise
        .then(() => {
            toastr.success(isEdit ? "Task Updated" : "Task Created");
            $("#taskModal").modal("hide");
            loadTasks();
        })
        .catch(err => toastr.error(err.response?.data?.detail || "Operation failed"))
        .finally(() => btn.prop("disabled", false).text(origText));
}

function deleteTask(id) {
    Swal.fire({
        title: 'Delete?', text: "This cannot be undone.", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Delete'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.delete(`/api/tasks/${id}`)
                .then(() => { toastr.success("Deleted"); loadTasks(); })
                .catch(() => toastr.error("Failed to delete"));
        }
    });
}
function formatDate(d) {
    if (!d) return '<span class="text-muted">-</span>';
    return new Date(d).toLocaleDateString() + ' ' + new Date(d).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

// ==========================================
// 5. CHAT (Paginated)
// ==========================================

function openChatModal(id, title) {
    activeChatTaskId = id;
    
    // Reset State
    chatTopId = 0;
    chatBottomId = 0;
    isLoadingChat = false;

    $("#chatTaskTitle").text(title);
    $("#chatContainer").empty().html('<div class="text-center py-5"><div class="spinner-border text-secondary spinner-border-sm"></div></div>');
    
    // Bind Scroll Event
    $("#chatContainer").off("scroll").on("scroll", function() {
        if ($(this).scrollTop() === 0 && !isLoadingChat) {
            loadChat(1); // Load Older
        }
    });

    $("#chatModal").modal("show");
    enableChatInput();
    loadChat(0); // Initial Load
}

function loadChat(direction) {
    if (!activeChatTaskId) return;

    let params = { direction: direction };
    if (direction === 1) params.last_message_id = chatTopId;
    if (direction === 2) params.last_message_id = chatBottomId;

    isLoadingChat = true;

    axios.get(`/api/tasks/${activeChatTaskId}/chat`, { params: params })
        .then(res => {
            const container = $("#chatContainer");
            const messages = res.data;

            if (direction === 0) {
                container.empty();
                if (messages.length === 0) {
                    container.html('<div class="text-center text-muted small mt-5 opacity-50" id="noMsgInfo">No messages yet.<br>Start the conversation!</div>');
                    isLoadingChat = false;
                    return;
                }
            }

            if (direction === 1 && messages.length === 0) {
                isLoadingChat = false;
                return; 
            }

            if (messages.length > 0) {
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
        .catch(() => $("#chatContainer").html('<div class="text-center text-danger py-4 small">Failed to load messages.</div>'))
        .finally(() => { isLoadingChat = false; });
}

function renderMessages(messages, direction) {
    const container = $("#chatContainer");
    const myId = parseInt($('meta[name="user-id"]').attr('content')) || 0;
    const prevHeight = container[0].scrollHeight;

    let htmlBuffer = "";

    messages.forEach(msg => {
        if (msg.is_system_log) {
            htmlBuffer += `<div class="text-center my-3"><span class="badge bg-light text-muted fw-normal border px-3 py-1 rounded-pill" style="font-size: 0.7rem;">${msg.message} &bull; ${formatTimeShort(msg.created_at)}</span></div>`;
        } else {
            const isMe = msg.author.id === myId;
            htmlBuffer += `
                <div class="chat-bubble ${isMe ? 'sent' : 'received'}">
                    ${!isMe ? `<div class="small fw-bold mb-1 text-primary">${msg.author.full_name || 'User'}</div>` : ''}
                    <div class="message-text">${msg.message}</div>
                    <div class="text-end mt-1" style="font-size:0.6rem; opacity:0.6;">${formatTimeShort(msg.created_at)}</div>
                </div>
            `;
        }
    });

    if (direction === 1) {
        container.prepend(htmlBuffer);
        container.scrollTop(container[0].scrollHeight - prevHeight);
    } else {
        container.append(htmlBuffer);
        container.scrollTop(container[0].scrollHeight);
    }
}

function sendMessage(e) {
    e.preventDefault();
    const input = $("#chatInput");
    const txt = input.val().trim();
    if (!txt || isChatSending) return;

    isChatSending = true;
    disableChatInput();
    $("#noMsgInfo").remove();

    axios.post(`/api/tasks/${activeChatTaskId}/chat`, { message: txt })
        .then((res) => { 
            input.val(""); 
            renderMessages([res.data], 2);
            chatBottomId = res.data.id;
        })
        .catch(err => { toastr.error("Failed to send"); console.error(err); })
        .finally(() => { isChatSending = false; enableChatInput(); setTimeout(() => input.focus(), 100); });
}

function disableChatInput() { $("#chatInput").prop("disabled", true); $("#btnSendChat").prop("disabled", true); $("#iconSend").addClass("d-none"); $("#spinnerSend").removeClass("d-none"); }
function enableChatInput() { $("#chatInput").prop("disabled", false); $("#btnSendChat").prop("disabled", false); $("#iconSend").removeClass("d-none"); $("#spinnerSend").addClass("d-none"); }
function formatTimeShort(dateStr) { if (!dateStr) return ''; return new Date(dateStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }