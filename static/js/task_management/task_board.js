/**
 * task_board.js
 * Generic Global Task Board.
 */

const { createApp, ref, reactive, computed, onMounted, nextTick } = Vue;

const app = createApp({
    delimiters: ['[[', ']]'], 
    components: { draggable: window.vuedraggable },
    
    setup() {
        const currentUser = ref({ 
            id: parseInt(document.querySelector('meta[name="user-id"]')?.content) || 1, 
            role: document.querySelector('meta[name="user-role"]')?.content || 'admin', 
            name: document.querySelector('meta[name="user-name"]')?.content || 'User'
        });

        const columns = ref([
            { id: 'To Do', title: 'To Do' },
            { id: 'In Progress', title: 'In Progress' },
            { id: 'Review', title: 'Review' },
            { id: 'Completed', title: 'Completed' }
        ]);

        const allTasks = ref([]);
        const allUsers = ref([]); 
        const projects = ref([]); 

        const filters = reactive({ search: '', assignee_id: '', priority: '', project_id: '' });
        
        const activeTask = ref(null);
        const newCommentText = ref('');
        const isDragging = ref(false);
        const isUploading = ref(false);
        const isEditingTask = ref(false);

        const taskForm = reactive({ id: null, project_id: '', title: '', description: '', assignee_id: '', lead_id: null, priority: 'Medium', due_date: '' });

        let mTask, mTaskDetail;

        const filteredTasks = computed(() => {
            return allTasks.value.filter(task => {
                const searchMatch = task.title.toLowerCase().includes(filters.search.toLowerCase());
                const assigneeMatch = !filters.assignee_id || task.assignee?.id === filters.assignee_id;
                const priorityMatch = !filters.priority || task.priority === filters.priority;
                const projectMatch = !filters.project_id || task.project_id === filters.project_id;
                return searchMatch && assigneeMatch && priorityMatch && projectMatch;
            });
        });

        const getTasks = (status) => filteredTasks.value.filter(t => t.status === status);
        const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';
        const getProjectName = (projId) => {
            const p = projects.value.find(p => p.id === projId);
            return p ? p.name : 'Unassigned Project';
        };
        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        const formatDateShort = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '-';
        const formatTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
        const isOverdue = (dateStr) => dateStr ? new Date(dateStr) < new Date() : false;
        
        const getStatusColor = (status) => {
            const map = { 'To Do': 'secondary', 'In Progress': 'warning', 'Review': 'primary', 'Completed': 'success' };
            return map[status] || 'dark';
        };

        const canDragTo = (columnId) => {
            if (currentUser.value.role === 'admin') return true;
            if (['sale', 'lead_generator', 'developer'].includes(currentUser.value.role) && columnId === 'Completed') return false; 
            return true;
        };

        const canDeleteTask = (task) => {
            if (!task) return false;
            return currentUser.value.role === 'admin' || currentUser.value.id === task.assigner?.id;
        };

        const loadGlobalData = async () => {
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                // FIXED 403 Error: Fetch from custom bypass endpoint
                const userRes = await axios.get('/api/tasks/assignable-users');
                allUsers.value = userRes.data;

                const projRes = await axios.get('/api/tasks/projects');
                projects.value = projRes.data || [];

                const taskRes = await axios.get('/api/tasks/');
                allTasks.value = taskRes.data.tasks || taskRes.data;
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to load board data.");
                console.error(err);
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        const reloadTasksOnly = async () => {
            try {
                const taskRes = await axios.get('/api/tasks/');
                allTasks.value = taskRes.data.tasks || taskRes.data;
            } catch (err) { console.error("Failed to refresh tasks", err); }
        };

        const openTaskModal = (editMode = false) => {
            const formObj = document.getElementById('taskFormObj');
            if (formObj) formObj.classList.remove('was-validated');

            isEditingTask.value = editMode;
            if (editMode && activeTask.value) {
                let dtString = '';
                if (activeTask.value.due_date) {
                    const dt = new Date(activeTask.value.due_date);
                    dtString = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                }

                Object.assign(taskForm, { 
                    id: activeTask.value.id, project_id: activeTask.value.project_id || '',
                    title: activeTask.value.title, description: activeTask.value.description, 
                    assignee_id: activeTask.value.assignee?.id || '', lead_id: activeTask.value.lead_id, 
                    priority: activeTask.value.priority, due_date: dtString 
                });
                mTaskDetail.hide(); 
            } else {
                Object.assign(taskForm, { id: null, project_id: '', title: '', description: '', assignee_id: '', lead_id: null, priority: 'Medium', due_date: '' });
            }
            mTask.show();
        };

        const submitTask = async (e) => {
            if (!e.target.checkValidity()) {
                e.preventDefault(); e.stopPropagation(); e.target.classList.add('was-validated'); return;
            }

            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                const payload = { ...taskForm, due_date: new Date(taskForm.due_date).toISOString() };
                
                if (isEditingTask.value) {
                    await axios.put(`/api/tasks/${taskForm.id}`, payload);
                    if (typeof showToastMessage === 'function') showToastMessage("success", "Task Updated");
                } else {
                    await axios.post('/api/tasks/', payload);
                    if (typeof showToastMessage === 'function') showToastMessage("success", "Task Created");
                }
                
                mTask.hide();
                await reloadTasksOnly();
                
                if (isEditingTask.value && activeTask.value) openTaskDetail({ id: taskForm.id }); 
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to save task");
                console.error(err);
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        const deleteTask = (taskId) => {
            Swal.fire({
                title: 'Delete Task?', text: "You won't be able to revert this!", icon: 'warning',
                showCancelButton: true, confirmButtonColor: '#DC2626', confirmButtonText: 'Delete'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    if (typeof myshowLoader === 'function') myshowLoader();
                    try {
                        await axios.delete(`/api/tasks/${taskId}`);
                        if (typeof showToastMessage === 'function') showToastMessage("success", "Task Deleted");
                        mTaskDetail.hide();
                        reloadTasksOnly();
                    } catch(err) { 
                        if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to delete task");
                    } finally {
                        if (typeof myhideLoader === 'function') myhideLoader();
                    }
                }
            });
        };

        const onTaskDrop = (evt, newStatus) => {
            if (evt.added) {
                const task = evt.added.element;
                if (['sale', 'lead_generator', 'developer'].includes(currentUser.value.role) && newStatus === 'Completed') {
                    if (typeof showToastMessage === 'function') showToastMessage("error", "Only Admins can mark tasks as Completed.");
                    reloadTasksOnly(); return;
                }
                task.status = newStatus;
                axios.patch(`/api/tasks/${task.id}/status`, { status: newStatus })
                    .catch(() => { 
                        if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to move task");
                        reloadTasksOnly(); 
                    });
            }
        };

        const openTaskDetail = async (task) => {
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                const res = await axios.get(`/api/tasks/${task.id}`);
                activeTask.value = res.data;
                mTaskDetail.show();
                nextTick(() => { const f = document.getElementById('commentFeed'); if(f) f.scrollTop = f.scrollHeight; });
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to load details");
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        const triggerFileInput = () => document.getElementById('hiddenFileInput').click();
        const handleFileDrop = (e) => { isDragging.value = false; const files = e.dataTransfer.files; if (files.length) processFiles(files); };
        const uploadAttachment = (e) => { if (e.target.files.length) processFiles(e.target.files); };

        // FIXED Upload Logic using /api/upload/small-file
        const processFiles = async (files) => {
            isUploading.value = true;
            let successCount = 0;

            for (let file of files) {
                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("type_group", "document"); 

                    // 1. Upload to main app server
                    const uploadRes = await axios.post('/api/upload/small-file', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });

                    if (uploadRes.data && uploadRes.data.status === 'success') {
                        // 2. Attach URL to Task JSON
                        const payload = {
                            file_url: uploadRes.data.url,
                            file_name: file.name,
                            thumbnail_url: uploadRes.data.url, 
                            file_size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
                            mime_type: file.type
                        };
                        await axios.post(`/api/tasks/${activeTask.value.id}/attachments`, payload);
                        successCount++;
                    }
                } catch (err) { 
                    if (typeof showToastMessage === 'function') showToastMessage("error", `Failed to upload ${file.name}`);
                }
            }
            
            isUploading.value = false;
            if (successCount > 0) {
                if (typeof showToastMessage === 'function') showToastMessage("success", "Files successfully uploaded.");
                openTaskDetail(activeTask.value);
                reloadTasksOnly(); 
            }
        };

        const deleteAttachment = (attId) => {
            Swal.fire({
                title: 'Remove File?', text: "This will permanently delete the file.", icon: 'warning',
                showCancelButton: true, confirmButtonColor: '#DC2626', confirmButtonText: 'Remove'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    if (typeof myshowLoader === 'function') myshowLoader();
                    try {
                        await axios.delete(`/api/tasks/attachments/${attId}`); 
                        if (typeof showToastMessage === 'function') showToastMessage("success", "File Removed");
                        openTaskDetail(activeTask.value);
                    } catch(err) { 
                        if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to remove file");
                    } finally {
                        if (typeof myhideLoader === 'function') myhideLoader();
                    }
                }
            });
        };

        const submitComment = async () => {
            if (!newCommentText.value.trim()) return;
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                await axios.post(`/api/tasks/${activeTask.value.id}/comments`, { comment: newCommentText.value });
                newCommentText.value = '';
                await openTaskDetail(activeTask.value); 
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to post comment");
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        const updateTaskStatus = async (newStatus) => {
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                await axios.patch(`/api/tasks/${activeTask.value.id}/status`, { status: newStatus });
                if (typeof showToastMessage === 'function') showToastMessage("success", `Task marked as ${newStatus}`);
                mTaskDetail.hide();
                reloadTasksOnly();
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Action failed");
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        onMounted(() => {
            mTask = new bootstrap.Modal(document.getElementById('taskModal'));
            mTaskDetail = new bootstrap.Modal(document.getElementById('taskDetailModal'));
            loadGlobalData();
        });

        return {
            currentUser, columns, allTasks, allUsers, projects, filters, filteredTasks,
            taskForm, activeTask, newCommentText, isEditingTask, isDragging, isUploading,
            getTasks, getInitials, getProjectName, formatDate, formatDateShort, formatTime, isOverdue, getStatusColor,
            canDragTo, canDeleteTask, 
            openTaskModal, submitTask, deleteTask, onTaskDrop, openTaskDetail,
            triggerFileInput, handleFileDrop, uploadAttachment, deleteAttachment,
            submitComment, updateTaskStatus
        };
    }
});
app.mount('#app');