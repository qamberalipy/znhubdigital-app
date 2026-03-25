document.addEventListener("DOMContentLoaded", () => {
    
    const { createApp, ref, computed, onMounted } = Vue;

    createApp({
        setup() {
            // Data States
            const leads = ref([]);
            const page = ref(1);
            const limit = ref(30);
            const hasMore = ref(true);
            const loading = ref(false);
            
            // --- Date Filter Setup ---
            const getStartOfWeek = () => {
                const d = new Date();
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
                return new Date(d.setDate(diff)).toISOString().split('T')[0];
            };
            const getEndOfWeek = () => {
                const d = new Date();
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1) + 6; // End of week
                return new Date(d.setDate(diff)).toISOString().split('T')[0];
            };

            const filter = ref({
                startDate: getStartOfWeek(),
                endDate: getEndOfWeek()
            });

            // UI States
            const isFullView = ref(false);
            const tableContainer = ref(null);
            
            // Button Loaders
            const isSavingOnly = ref(false);
            const isSavingNext = ref(false);
            const isSavingComment = ref(false);

            // Selection & Editing
            const selectedLeads = ref([]);
            const editingId = ref(null);
            const editForm = ref({});
            
            // Comment Modal
            const activeCommentData = ref({ id: null, comment: '' });
            let addModalInstance = null;
            let commentModalInstance = null;

            // Enums
            const sourceOptions = ["Facebook", "LinkedIn", "Bark", "Upwork", "Threads", "Website", "Referral", "Other"];
            const typeOptions = ["Website", "Logo Design", "Graphic Design", "App Development", "CRM Development", "Go High Level", "Squarespace", "Wix", "Shopify", "SEO", "SMM", "Web App", "Marketing", "Digital Marketing", "Other"];
            const statusOptions = ["New", "Contacted", "No Response", "Wrong Number"];

            const initialFormState = () => ({
                name: '', phone_number: '', email: '',
                lead_source: 'Facebook', lead_type: 'Website', description: ''
            });
            const form = ref(initialFormState());

            const selectAll = computed({
                get: () => leads.value.length > 0 && selectedLeads.value.length === leads.value.length,
                set: (value) => { selectedLeads.value = value ? leads.value.map(l => l.id) : []; }
            });

            onMounted(() => {
                addModalInstance = new bootstrap.Modal(document.getElementById('addLeadModal'), { backdrop: 'static' });
                commentModalInstance = new bootstrap.Modal(document.getElementById('commentModal'));
                fetchLeads();
            });

            // --- API: Fetch Leads with Date Filters ---
            const fetchLeads = async (append = false) => {
                if (loading.value) return;
                loading.value = true;
                
                try {
                    let url = `/api/leads/?skip=${page.value}&limit=${limit.value}`;
                    
                    // Attach ISO Formatted Date strings if filter exists
                    if (filter.value.startDate) url += `&start_date=${filter.value.startDate}T00:00:00`;
                    if (filter.value.endDate) url += `&end_date=${filter.value.endDate}T23:59:59`;

                    const response = await axios.get(url);
                    if (append) {
                        leads.value = [...leads.value, ...response.data.leads];
                    } else {
                        leads.value = response.data.leads;
                    }
                    hasMore.value = response.data.leads.length === limit.value;
                } catch (error) {
                    toastr.error("Failed to load leads.");
                } finally {
                    loading.value = false;
                }
            };

            // Filter Handlers
            const applyFilter = () => {
                page.value = 1;
                leads.value = [];
                hasMore.value = true;
                fetchLeads();
            };

            const clearFilter = () => {
                filter.value.startDate = '';
                filter.value.endDate = '';
                applyFilter();
            };

            // Infinite Scroll
            const handleScroll = (e) => {
                const el = e.target;
                if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
                    if (!loading.value && hasMore.value) {
                        page.value++;
                        fetchLeads(true);
                    }
                }
            };

            // CRUD Operations
            const openAddModal = () => {
                form.value = initialFormState();
                addModalInstance.show();
            };

            const saveLead = async (isNext = false) => {
                if(!form.value.name) return toastr.warning("Name is required.");

                if (isNext) isSavingNext.value = true;
                else isSavingOnly.value = true;

                try {
                    const response = await axios.post('/api/leads/', form.value);
                    toastr.success("Lead created successfully!");
                    leads.value.unshift(response.data); 
                    
                    if (isNext) {
                        form.value = initialFormState();
                        document.getElementById('leadForm').elements[0].focus(); 
                    } else {
                        addModalInstance.hide();
                    }
                } catch (error) {
                    toastr.error("Failed to save lead.");
                } finally {
                    isSavingNext.value = false;
                    isSavingOnly.value = false;
                }
            };

            const deleteSelected = async () => {
                const count = selectedLeads.value.length;
                if (count === 0) return;

                const result = await Swal.fire({
                    title: 'Delete Leads?',
                    text: `You are about to delete ${count} lead(s).`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#ef4444',
                    confirmButtonText: 'Yes, Delete'
                });

                if (result.isConfirmed) {
                    loading.value = true;
                    try {
                        await Promise.all(selectedLeads.value.map(id => axios.delete(`/api/leads/${id}`)));
                        toastr.success(`${count} lead(s) deleted.`);
                        leads.value = leads.value.filter(l => !selectedLeads.value.includes(l.id));
                        selectedLeads.value = [];
                    } catch (error) {
                        toastr.error("Failed to delete some leads.");
                    } finally {
                        loading.value = false;
                    }
                }
            };

            // Row Editing
            const startEdit = (lead) => {
                editingId.value = lead.id;
                editForm.value = { ...lead };
            };

            const cancelEdit = () => {
                editingId.value = null;
                editForm.value = {};
            };

            const saveEdit = async () => {
                const id = editingId.value;
                try {
                    const response = await axios.put(`/api/leads/${id}`, editForm.value);
                    const idx = leads.value.findIndex(l => l.id === id);
                    if (idx !== -1) leads.value[idx] = { ...response.data };
                    
                    editingId.value = null;
                    toastr.success("Lead updated!");
                } catch (error) {
                    toastr.error("Failed to update lead.");
                }
            };

            const quickUpdateLead = async (lead, field) => {
                try {
                    const payload = {};
                    payload[field] = lead[field];
                    await axios.put(`/api/leads/${lead.id}`, payload);
                    toastr.success("Status updated!");
                } catch (error) {
                    toastr.error("Failed to update status.");
                }
            };

            // Comment Modal
            const openCommentModal = (lead) => {
                activeCommentData.value = { id: lead.id, comment: lead.comment || '' };
                commentModalInstance.show();
            };

            const saveComment = async () => {
                isSavingComment.value = true;
                try {
                    await axios.put(`/api/leads/${activeCommentData.value.id}`, { comment: activeCommentData.value.comment });
                    const idx = leads.value.findIndex(l => l.id === activeCommentData.value.id);
                    if (idx !== -1) leads.value[idx].comment = activeCommentData.value.comment;
                    
                    toastr.success("Comment saved!");
                    commentModalInstance.hide();
                } catch (error) {
                    toastr.error("Failed to save comment.");
                } finally {
                    isSavingComment.value = false;
                }
            };

            // Utilities
            const copyText = async (text) => {
                try {
                    await navigator.clipboard.writeText(text);
                    toastr.info("Copied!", "", { timeOut: 1000 });
                } catch (err) {}
            };

            const formatDate = (dateString) => {
                const d = new Date(dateString);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            const getStatusClass = (status) => {
                if(status === 'New') return 'text-primary bg-primary bg-opacity-10';
                if(status === 'Contacted') return 'text-warning bg-warning bg-opacity-10';
                if(status === 'No Response') return 'text-secondary bg-secondary bg-opacity-10';
                if(status === 'Wrong Number') return 'text-danger bg-danger bg-opacity-10';
                return '';
            };

            const toggleFullView = () => {
                isFullView.value = !isFullView.value;
                const body = document.body;
                if (isFullView.value) body.classList.add('lead-full-view');
                else body.classList.remove('lead-full-view');
            };

            return {
                leads, loading, isSavingOnly, isSavingNext, isSavingComment, form, hasMore, 
                isFullView, tableContainer, sourceOptions, typeOptions, statusOptions,
                selectedLeads, selectAll, editingId, editForm, activeCommentData, filter,
                handleScroll, openAddModal, saveLead, deleteSelected, 
                startEdit, cancelEdit, saveEdit, quickUpdateLead, applyFilter, clearFilter,
                openCommentModal, saveComment, copyText, formatDate, getStatusClass, toggleFullView
            };
        }
    }).mount('#lead-app');

});