/**
 * task_board.js
 * Full SPA Implementation: Kanban Board -> Full Screen Detail View.
 * Features: Project Persistence, View Swapping, API Loading States.
 */

const { createApp, ref, reactive, computed, watch, onMounted, nextTick } = Vue;

const app = createApp({
    delimiters: ['[[', ']]'], 
    components: { draggable: window.vuedraggable },
    
    setup() {
        // --- Context ---
        const currentUser = ref({ 
            id: parseInt(document.querySelector('meta[name="user-id"]')?.content) || 1, 
            role: document.querySelector('meta[name="user-role"]')?.content || 'admin', 
            name: document.querySelector('meta[name="user-name"]')?.content || 'User'
        });

        // --- Core UI State ---
        const currentView = ref('board'); // 'board' | 'task_detail'
        const isFetchingTasks = ref(false); // Controls Kanban loading spinner
        
        const columns = ref([
            { id: 'To Do', title: 'To Do' },
            { id: 'In Progress', title: 'In Progress' },
            { id: 'Review', title: 'Review' },
            { id: 'Completed', title: 'Completed' }
        ]);

        const allTasks = ref([]);
        const allUsers = ref([]); 
        const projects = ref([]); 

        // Filters (Bound to LocalStorage via watchers later)
        const filters = reactive({ search: '', assignee_id: '', priority: '', project_id: '' });
        
        // Active Elements State
        const activeTask = ref(null);
        const newCommentText = ref('');
        const isDragging = ref(false);
        const isUploading = ref(false);
        const isEditingTask = ref(false);

        // Form State
        const taskForm = reactive({ id: null, project_id: '', title: '', description: '', assignee_id: '', lead_id: null, priority: 'Medium', due_date: '' });

        let mTask;

        // --- Computed Properties ---
        const filteredTasks = computed(() => {
            return allTasks.value.filter(task => {
                const searchMatch = task.title.toLowerCase().includes(filters.search.toLowerCase());
                const assigneeMatch = !filters.assignee_id || task.assignee?.id === filters.assignee_id;
                const priorityMatch = !filters.priority || task.priority === filters.priority;
                return searchMatch && assigneeMatch && priorityMatch;
            });
        });

        // --- Utility Methods ---
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

        // --- Security & Rules ---
        const canDragTo = (columnId) => {
            if (currentUser.value.role === 'admin') return true;
            if (['sale', 'lead_generator', 'developer'].includes(currentUser.value.role) && columnId === 'Completed') return false; 
            return true;
        };

        const canDeleteTask = (task) => {
            if (!task) return false;
            return currentUser.value.role === 'admin' || currentUser.value.id === task.assigner?.id;
        };

        // --- Navigation (View Switching) ---
        const goBackToBoard = () => {
            currentView.value = 'board';
            activeTask.value = null;
        };

        const openTaskDetail = async (taskId) => {
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                const res = await axios.get(`/api/tasks/${taskId}`);
                activeTask.value = res.data;
                currentView.value = 'task_detail';
                
                nextTick(() => { 
                    const f = document.getElementById('commentFeed'); 
                    if(f) f.scrollTop = f.scrollHeight; 
                });
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to load details");
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        // --- Data Loading & Project Persistence ---
        
        // Watch for Project Selection Changes -> Save to LocalStorage & Fetch Tasks
        watch(() => filters.project_id, (newVal) => {
            if (newVal) {
                localStorage.setItem('zn_last_project_id', newVal);
                fetchTasksForProject(newVal);
            } else {
                allTasks.value = [];
            }
        });

        const fetchTasksForProject = async (projectId) => {
            isFetchingTasks.value = true;
            try {
                const taskRes = await axios.get(`/api/tasks/?project_id=${projectId}`);
                allTasks.value = taskRes.data.tasks || taskRes.data;
            } catch (err) {
                console.error("Failed to load tasks", err);
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to sync tasks.");
            } finally {
                isFetchingTasks.value = false;
            }
        };

        const loadGlobalData = async () => {
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                // Fetch Users
                const userRes = await axios.get('/api/tasks/assignable-users');
                allUsers.value = userRes.data;

                // Fetch Projects
                const projRes = await axios.get('/api/tasks/projects');
                projects.value = projRes.data || [];

                // Persistence Logic
                const savedProjId = localStorage.getItem('zn_last_project_id');
                if (savedProjId && projects.value.some(p => p.id == savedProjId)) {
                    // This will trigger the watcher and automatically fetch the tasks
                    filters.project_id = parseInt(savedProjId); 
                } 
                // If we didn't set a project_id, the UI automatically shows the Empty State!
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to load board data.");
                console.error(err);
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        // --- Task CRUD ---
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
                    id: activeTask.value.id, 
                    project_id: activeTask.value.project_id || filters.project_id,
                    title: activeTask.value.title, 
                    description: activeTask.value.description, 
                    assignee_id: activeTask.value.assignee?.id || '', 
                    lead_id: activeTask.value.lead_id, 
                    priority: activeTask.value.priority, 
                    due_date: dtString 
                });
            } else {
                Object.assign(taskForm, { 
                    id: null, 
                    project_id: filters.project_id, // Default to current board
                    title: '', description: '', assignee_id: '', lead_id: null, priority: 'Medium', due_date: '' 
                });
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
                
                // Refresh data
                if (filters.project_id) fetchTasksForProject(filters.project_id);
                
                // If editing from the detail view, update the view context implicitly by re-fetching
                if (isEditingTask.value && activeTask.value) {
                    openTaskDetail(taskForm.id); 
                }
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
                        goBackToBoard(); // Leave detail view
                        if (filters.project_id) fetchTasksForProject(filters.project_id);
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
                    fetchTasksForProject(filters.project_id); return;
                }
                task.status = newStatus;
                axios.patch(`/api/tasks/${task.id}/status`, { status: newStatus })
                    .catch(() => { 
                        if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to move task");
                        fetchTasksForProject(filters.project_id); 
                    });
            }
        };

        // --- Attachments ---
        const triggerFileInput = () => document.getElementById('hiddenFileInput').click();
        const handleFileDrop = (e) => { isDragging.value = false; const files = e.dataTransfer.files; if (files.length) processFiles(files); };
        const uploadAttachment = (e) => { if (e.target.files.length) processFiles(e.target.files); };

        const processFiles = async (files) => {
            isUploading.value = true;
            let successCount = 0;

            for (let file of files) {
                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("type_group", "document"); 

                    const uploadRes = await axios.post('/api/upload/small-file', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });

                    if (uploadRes.data && uploadRes.data.status === 'success') {
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
                openTaskDetail(activeTask.value.id);
                if (filters.project_id) fetchTasksForProject(filters.project_id); 
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
                        openTaskDetail(activeTask.value.id);
                    } catch(err) { 
                        if (typeof showToastMessage === 'function') showToastMessage("error", "Failed to remove file");
                    } finally {
                        if (typeof myhideLoader === 'function') myhideLoader();
                    }
                }
            });
        };

        // --- Updates & Comments ---
        const submitComment = async () => {
            if (!newCommentText.value.trim()) return;
            if (typeof myshowLoader === 'function') myshowLoader();
            try {
                await axios.post(`/api/tasks/${activeTask.value.id}/comments`, { comment: newCommentText.value });
                newCommentText.value = '';
                await openTaskDetail(activeTask.value.id); 
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
                openTaskDetail(activeTask.value.id);
                if (filters.project_id) fetchTasksForProject(filters.project_id);
            } catch (err) { 
                if (typeof showToastMessage === 'function') showToastMessage("error", "Action failed");
            } finally {
                if (typeof myhideLoader === 'function') myhideLoader();
            }
        };

        // --- Init ---
        onMounted(() => {
            mTask = new bootstrap.Modal(document.getElementById('taskModal'));
            loadGlobalData();
        });

        return {
            currentUser, currentView, isFetchingTasks, columns, allTasks, allUsers, projects, filters, filteredTasks,
            taskForm, activeTask, newCommentText, isEditingTask, isDragging, isUploading,
            getTasks, getInitials, getProjectName, formatDate, formatDateShort, formatTime, isOverdue, getStatusColor,
            canDragTo, canDeleteTask, goBackToBoard, 
            openTaskModal, submitTask, deleteTask, onTaskDrop, openTaskDetail,
            triggerFileInput, handleFileDrop, uploadAttachment, deleteAttachment,
            submitComment, updateTaskStatus
        };
    }
});

app.mount('#app');