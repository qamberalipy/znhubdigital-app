/**
 * project_management.js
 * Bulletproof Vue 3 SPA for Project Settings, View Mode, and Multi-Select Team Allocation.
 */

const { createApp, ref, reactive, computed, watch, onMounted, nextTick } = Vue;

const projectApp = createApp({
    delimiters: ['[[', ']]'], 
    
    setup() {
        // --- Core State ---
        const projects = ref([]);
        const allUsers = ref([]);
        
        const isEditing = ref(false);
        const activeProject = ref(null);

        // --- Form State ---
        const projectForm = reactive({ id: null, name: '', description: '', status: 'Active' });
        
        // This MUST be declared to prevent the ReferenceError you saw
        const teamForm = reactive({ user_ids: [] });
        
        const localTeamMembers = ref([]);

        // --- Modals ---
        let mProject, mTeam, mView;

        // --- Computed Properties ---
        // Filters dropdown to only show users who are NOT currently in the project
        const availableUsers = computed(() => {
            const assignedIds = localTeamMembers.value.map(m => m.id);
            return allUsers.value.filter(u => !assignedIds.includes(u.id));
        });

        // --- Watchers ---
        // Whenever availableUsers changes, strictly rebuild the bootstrap-select plugin
        watch(availableUsers, () => {
            nextTick(() => {
                const $select = $('#userMultiSelect');
                if ($select.length) {
                    $select.selectpicker('destroy');
                    $select.selectpicker();
                }
            });
        });

        // --- API Loaders ---
        const loadUsers = async () => {
            try {
                const userRes = await axios.get('/api/users/');
                allUsers.value = userRes.data.filter(u => ['admin', 'sale', 'lead_generator', 'developer'].includes(u.role));
            } catch (err) {
                console.error("User Load Error", err);
            }
        };

        const loadProjects = async () => {
            if(typeof myshowLoader === 'function') myshowLoader();
            try {
                const projRes = await axios.get('/api/tasks/projects');
                projects.value = projRes.data || [];
            } catch (err) {
                if(typeof showToastMessage === 'function') showToastMessage("error", "Failed to load projects.");
            } finally {
                if(typeof myhideLoader === 'function') myhideLoader();
            }
        };

        // --- Modal Launchers ---
        const openViewModal = (project) => {
            activeProject.value = project;
            mView.show();
        };

        const openProjectModal = (project = null) => {
            const formObj = document.getElementById('projectForm');
            if (formObj) formObj.classList.remove('was-validated'); 

            if (project) {
                isEditing.value = true;
                Object.assign(projectForm, { 
                    id: project.id, name: project.name, 
                    description: project.description, status: project.status 
                });
                mView.hide(); 
            } else {
                isEditing.value = false;
                Object.assign(projectForm, { id: null, name: '', description: '', status: 'Active' });
            }
            mProject.show();
        };

        const openTeamModal = (project) => {
            activeProject.value = project;
            mView.hide(); 
            
            localTeamMembers.value = [...(project.members || [])]; 

            nextTick(() => {
                $('#userMultiSelect').val([]);
                $('#userMultiSelect').selectpicker('refresh');
            });

            mTeam.show();
        };

        // --- Team Array Manipulation ---
        const removeMember = (member) => {
            localTeamMembers.value = localTeamMembers.value.filter(m => m.id !== member.id);
        };

        const addSelectedMembers = () => {
            const selectedIds = $('#userMultiSelect').val() || [];
            if (selectedIds.length === 0) return;

            const usersToAdd = allUsers.value.filter(u => selectedIds.includes(u.id.toString()));
            localTeamMembers.value.push(...usersToAdd);

            nextTick(() => {
                $('#userMultiSelect').val([]);
                $('#userMultiSelect').selectpicker('refresh');
            });
        };

        const saveTeamMembers = async () => {
            // Populate the teamForm variable just before sending
            teamForm.user_ids = localTeamMembers.value.map(m => m.id);

            if(typeof myshowLoader === 'function') myshowLoader();
            try {
                await axios.post(`/api/tasks/projects/${activeProject.value.id}/members`, teamForm);
                if(typeof showToastMessage === 'function') showToastMessage("success", "Access updated.");
                mTeam.hide();
                loadProjects();
            } catch (err) {
                if(typeof showToastMessage === 'function') showToastMessage("error", "Failed to allocate team.");
                if(typeof myhideLoader === 'function') myhideLoader();
            }
        };

        // --- CRUD Operations ---
        const saveProject = async (e) => {
            if (!e.target.checkValidity()) {
                e.preventDefault();
                e.stopPropagation();
                e.target.classList.add('was-validated');
                return;
            }

            if(typeof myshowLoader === 'function') myshowLoader();
            try {
                if (isEditing.value) {
                    await axios.put(`/api/tasks/projects/${projectForm.id}`, projectForm);
                    if(typeof showToastMessage === 'function') showToastMessage("success", "Project updated.");
                } else {
                    await axios.post('/api/tasks/projects', projectForm);
                    if(typeof showToastMessage === 'function') showToastMessage("success", "Project created.");
                }
                mProject.hide();
                loadProjects();
            } catch (err) {
                if(typeof showToastMessage === 'function') showToastMessage("error", err.response?.data?.detail || "Error saving project.");
                if(typeof myhideLoader === 'function') myhideLoader();
            }
        };

        const deleteProject = (project) => {
            Swal.fire({
                title: 'Delete Project?',
                text: `Are you sure you want to remove ${project.name}?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#DC2626',
                confirmButtonText: 'Yes, delete it!'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    if(typeof myshowLoader === 'function') myshowLoader();
                    try {
                        await axios.delete(`/api/tasks/projects/${project.id}`);
                        if(typeof showToastMessage === 'function') showToastMessage("success", "Project deleted.");
                        loadProjects();
                    } catch(err) {
                        if(typeof showToastMessage === 'function') showToastMessage("error", "Failed to delete project.");
                        if(typeof myhideLoader === 'function') myhideLoader();
                    }
                }
            });
        };

        // --- UI Formatters ---
        const getInitials = (name) => {
            if (!name) return 'U';
            const parts = name.split(' ');
            return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return 'Unknown Date';
            return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const getStatusBadgeClass = (status) => {
            if (!status) return 'bg-light text-dark';
            switch(status) {
                case 'Active': return 'bg-success-subtle text-success border border-success-subtle';
                case 'On Hold': return 'bg-warning-subtle text-warning border border-warning-subtle';
                case 'Completed': return 'bg-primary-subtle text-primary border border-primary-subtle';
                default: return 'bg-light text-dark';
            }
        };

        // --- Initialization ---
        onMounted(() => {
            mProject = new bootstrap.Modal(document.getElementById('projectModal'));
            mTeam = new bootstrap.Modal(document.getElementById('teamModal'));
            mView = new bootstrap.Modal(document.getElementById('viewProjectModal'));
            
            loadUsers();
            loadProjects();
        });

        // Note: EVERYTHING used in the template MUST be returned here.
        return {
            projects, allUsers, activeProject, availableUsers, localTeamMembers,
            isEditing, projectForm, teamForm, 
            openViewModal, openProjectModal, saveProject, deleteProject,
            openTeamModal, addSelectedMembers, removeMember, saveTeamMembers,
            getInitials, formatDate, getStatusBadgeClass
        };
    }
});

projectApp.mount('#projectApp');