/**
 * task_board.js
 * Vue 3 Kanban Board for ZN Digital Hub CRM.
 * Integrates with FastAPI endpoints and SQLAlchemy payload structures.
 */

const { createApp, ref, reactive, computed, onMounted, nextTick } = Vue;

const app = createApp({
    // Custom delimiters to avoid conflict with Jinja2 if used
    delimiters: ['[[', ']]'], 
    components: {
        draggable: window.vuedraggable
    },
    
    setup() {
        // --- Mocking Current User Context ---
        // In production, grab this from your meta tags or an auth endpoint
        const currentUser = ref({
            id: 1, // Change to employee ID to test employee logic
            role: 'admin', // 'admin' or 'employee'
            name: 'Kamble Ali' 
        });

        // --- State ---
        const columns = ref([
            { id: 'To Do', title: 'To Do' },
            { id: 'In Progress', title: 'In Progress' },
            { id: 'Review', title: 'Review' },
            { id: 'Completed', title: 'Completed' }
        ]);

        const allTasks = ref([]);
        const users = ref([]); // For assignment dropdown

        const filters = reactive({
            search: '',
            assignee: '',
            priority: ''
        });

        const activeTask = ref(null);
        const newCommentText = ref('');

        const taskForm = reactive({
            title: '',
            description: '',
            assignee_id: '',
            lead_id: null,
            priority: 'Medium',
            due_date: ''
        });

        // --- Bootstrap Modals Reference ---
        let createModalObj = null;
        let detailModalObj = null;

        // --- Computed Properties ---
        
        // Filter the tasks based on the header filters
        const filteredTasks = computed(() => {
            return allTasks.value.filter(task => {
                const matchSearch = task.title.toLowerCase().includes(filters.search.toLowerCase());
                const matchAssignee = filters.assignee === '' || task.assignee_id === filters.assignee;
                const matchPriority = filters.priority === '' || task.priority === filters.priority;
                return matchSearch && matchAssignee && matchPriority;
            });
        });

        // --- Methods ---

        const getTasks = (status) => {
            return filteredTasks.value.filter(t => t.status === status);
        };

        const getInitials = (name) => {
            if (!name) return 'U';
            return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const formatTime = (dateStr) => {
            if (!dateStr) return '-';
            return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        };

        // --- Permissions Logic ---
        
        const canDragTo = (columnId) => {
            if (currentUser.value.role === 'admin') return true;
            // Employees cannot move tasks to Completed directly, must go to Review
            if (currentUser.value.role === 'employee' && columnId === 'Completed') return false;
            return true;
        };

        const canEditTask = (task) => {
            if (currentUser.value.role === 'admin') return true;
            if (task.status === 'Completed') return false; // Locked when completed
            return currentUser.value.id === task.assignee_id;
        };

        // --- Drag & Drop Handler ---
        
        const onTaskDrop = (evt, newStatus) => {
            if (evt.added) {
                const task = evt.added.element;
                const oldStatus = task.status;
                
                // Permission Validation
                if (currentUser.value.role === 'employee' && newStatus === 'Completed') {
                    toastr.error("Only Admins can mark tasks as Completed. Please move to Review.");
                    loadTasks(); // Revert UI
                    return;
                }

                // Update Local UI
                task.status = newStatus;

                // API Call to update status
                axios.patch(`/api/tasks/${task.id}/status`, { status: newStatus })
                    .then(() => {
                        toastr.success(`Task moved to ${newStatus}`);
                        // Create an automatic system comment/log
                        logSystemEvent(task.id, `Status changed from ${oldStatus} to ${newStatus}`);
                    })
                    .catch(err => {
                        console.error(err);
                        toastr.error("Failed to move task");
                        task.status = oldStatus; // Revert on failure
                        loadTasks(); 
                    });
            }
        };

        const logSystemEvent = (taskId, message) => {
             // Silently add a system comment to the backend
             axios.post(`/api/tasks/${taskId}/comments`, {
                 comment: message,
                 is_system_log: true
             }).then(() => loadTasks()); // Refresh to get comment counts
        };

        // --- Modal Interactions ---

        const openCreateModal = () => {
            // Reset Form
            Object.assign(taskForm, {
                title: '', description: '', assignee_id: '', lead_id: null, priority: 'Medium', due_date: ''
            });
            createModalObj.show();
        };

        const openTaskDetail = (task) => {
            activeTask.value = { ...task }; 
            // Fetch detailed comments and attachments if not loaded in main payload
            fetchTaskDetails(task.id);
            detailModalObj.show();
        };

        // --- API Calls ---

        const loadTasks = async () => {
            try {
                // Adjust to your actual FastAPI endpoint
                const res = await axios.get('/api/tasks/');
                // Check if backend wraps in { tasks: [] } or just returns list
                allTasks.value = res.data.tasks || res.data;
            } catch (err) {
                console.error("API Error", err);
                // MOCK DATA FALLBACK for UI demonstration
                allTasks.value = [
                    { id: 1, title: 'Integrate FastAPI endpoints', description: 'Connect the Vue frontend to the new Python backend.', status: 'In Progress', priority: 'High', assignee_id: 2, assignee_name: 'Dev Team', lead_id: 1042, due_date: '2026-03-30T10:00:00', attachments_count: 1, comments_count: 3 },
                    { id: 2, title: 'Theme Rebranding for ZN Hub', description: 'Update CSS variables and logos to match new brand guidelines.', status: 'Review', priority: 'Medium', assignee_id: 1, assignee_name: 'Kamble Ali', lead_id: null, due_date: '2026-03-28T10:00:00', attachments_count: 2, comments_count: 1 }
                ];
            }
        };

        const loadUsers = async () => {
            try {
                const res = await axios.get('/api/users/');
                users.value = res.data;
            } catch (err) {
                // MOCK FALLBACK
                users.value = [
                    { id: 1, name: 'Kamble Ali', role: 'admin' },
                    { id: 2, name: 'Dev Team', role: 'developer' },
                    { id: 3, name: 'Sales Agent', role: 'sales' }
                ];
            }
        };

        const fetchTaskDetails = async (id) => {
            try {
                const res = await axios.get(`/api/tasks/${id}/details`);
                activeTask.value.comments = res.data.comments;
                activeTask.value.attachments = res.data.attachments;
                scrollToBottom();
            } catch (err) {
                // Mock comments for testing
                activeTask.value.comments = [
                    { id: 101, user_name: 'Admin', comment: 'Task assigned.', created_at: new Date().toISOString(), is_system_log: true },
                    { id: 102, user_name: 'Dev Team', comment: 'Started working on API integration as requested.', created_at: new Date().toISOString(), is_system_log: false }
                ];
                activeTask.value.attachments = [];
            }
        };

        const submitNewTask = async () => {
            try {
                // Ensure date is ISO string for FastAPI/SQLAlchemy timezone=True
                const payload = { ...taskForm, due_date: new Date(taskForm.due_date).toISOString() };
                
                await axios.post('/api/tasks/', payload);
                toastr.success("Task created successfully");
                createModalObj.hide();
                loadTasks();
            } catch (err) {
                toastr.error("Error creating task");
                console.error(err);
            }
        };

        const submitComment = async () => {
            if (!newCommentText.value.trim()) return;
            
            try {
                await axios.post(`/api/tasks/${activeTask.value.id}/comments`, {
                    comment: newCommentText.value,
                    is_system_log: false
                });
                
                newCommentText.value = '';
                fetchTaskDetails(activeTask.value.id); // Reload comments
                loadTasks(); // Update counts on board
            } catch (err) {
                toastr.error("Failed to post update");
            }
        };

        const uploadAttachment = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);
            formData.append('task_id', activeTask.value.id);

            try {
                toastr.info("Uploading file...");
                await axios.post(`/api/tasks/${activeTask.value.id}/attachments`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toastr.success("File uploaded");
                fetchTaskDetails(activeTask.value.id);
                loadTasks();
            } catch (err) {
                toastr.error("Upload failed");
            }
        };

        // Admin Specific Review Action
        const adminReviewTask = async (newStatus) => {
            try {
                await axios.patch(`/api/tasks/${activeTask.value.id}/status`, { status: newStatus });
                
                let logMsg = newStatus === 'Completed' ? 'Admin approved the work.' : 'Admin rejected the work. Sent back for revisions.';
                await axios.post(`/api/tasks/${activeTask.value.id}/comments`, { comment: logMsg, is_system_log: true });
                
                toastr.success(`Task marked as ${newStatus}`);
                detailModalObj.hide();
                loadTasks();
            } catch (err) {
                toastr.error("Action failed");
            }
        };

        const scrollToBottom = () => {
            nextTick(() => {
                const feed = document.getElementById('commentFeed');
                if (feed) feed.scrollTop = feed.scrollHeight;
            });
        };

        // --- Lifecycle Hooks ---
        onMounted(() => {
            // Initialize Bootstrap Modals
            createModalObj = new bootstrap.Modal(document.getElementById('createTaskModal'));
            detailModalObj = new bootstrap.Modal(document.getElementById('taskDetailModal'));
            
            loadUsers();
            loadTasks();
        });

        return {
            currentUser, columns, filters, users,
            taskForm, activeTask, newCommentText,
            getTasks, getInitials, formatDate, formatTime,
            canDragTo, canEditTask, onTaskDrop,
            openCreateModal, openTaskDetail,
            submitNewTask, submitComment, uploadAttachment, adminReviewTask
        };
    }
});

app.mount('#app');