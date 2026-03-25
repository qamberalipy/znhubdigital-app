// Wait for all HTML and scripts at the bottom of base.html to load
document.addEventListener("DOMContentLoaded", () => {
    
    const { createApp, ref, onMounted } = Vue;

    createApp({
        setup() {
            // State
            const leads = ref([]);
            const loading = ref(false);
            const isSaving = ref(false);
            const page = ref(1);
            const limit = ref(30);
            const hasMore = ref(true);
            const isFullView = ref(false);
            const tableContainer = ref(null);
            let modalInstance = null;

            // Enums mapping directly to your backend
            const sourceOptions = ["Facebook", "LinkedIn", "Bark", "Upwork", "Threads", "Website", "Referral", "Other"];
            const typeOptions = ["Website", "Logo Design", "Graphic Design", "App Development", "CRM Development", "Go High Level", "Squarespace", "Wix", "Shopify", "SEO", "SMM", "Web App", "Marketing", "Digital Marketing", "Other"];
            const statusOptions = ["New", "Contacted", "No Response", "Wrong Number"];

            // Form Object
            const initialFormState = () => ({
                name: '', phone_number: '', email: '',
                lead_source: 'Other', lead_type: 'Other', description: ''
            });
            const form = ref(initialFormState());

            // Initialize
            onMounted(() => {
                // Now bootstrap and axios are guaranteed to be fully loaded
                modalInstance = new bootstrap.Modal(document.getElementById('addLeadModal'), { backdrop: 'static' });
                fetchLeads();
            });

            // Fetch Leads
            const fetchLeads = async (append = false) => {
                if (loading.value) return;
                loading.value = true;

                try {
                    const response = await axios.get(`/api/leads/?skip=${page.value}&limit=${limit.value}`);
                    if (append) {
                        leads.value = [...leads.value, ...response.data.leads];
                    } else {
                        leads.value = response.data.leads;
                    }
                    hasMore.value = response.data.leads.length === limit.value;
                } catch (error) {
                    toastr.error("Failed to load leads.");
                    console.error(error);
                } finally {
                    loading.value = false;
                }
            };

            // Infinite Scroll Handler
            const handleScroll = (e) => {
                const el = e.target;
                // Trigger fetch when user is 50px away from the bottom
                if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
                    if (!loading.value && hasMore.value) {
                        page.value++;
                        fetchLeads(true);
                    }
                }
            };

            // Open Modal
            const openAddModal = () => {
                form.value = initialFormState(); // Reset form
                modalInstance.show();
            };

            // Create Lead
            const saveLead = async (isNext = false) => {
                if(!form.value.name || !form.value.lead_source || !form.value.lead_type) {
                    toastr.warning("Please fill the required fields.");
                    return;
                }

                isSaving.value = true;
                try {
                    const response = await axios.post('/api/leads/', form.value);
                    toastr.success("Lead added successfully!");
                    
                    // Unshift to place at the top of the sheet
                    leads.value.unshift(response.data);
                    
                    if (isNext) {
                        // Reset for next entry
                        form.value = initialFormState();
                        document.getElementById('leadForm').elements[0].focus(); // Focus first input
                    } else {
                        modalInstance.hide();
                    }
                } catch (error) {
                    toastr.error(error.response?.data?.detail || "Failed to save lead.");
                } finally {
                    isSaving.value = false;
                }
            };

            // Inline Update (Status & Comment)
            const updateLead = async (lead, field) => {
                try {
                    const payload = {};
                    payload[field] = lead[field];
                    
                    await axios.put(`/api/leads/${lead.id}`, payload);
                    toastr.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated!`, '', { timeOut: 1500 });
                } catch (error) {
                    toastr.error(`Failed to update ${field}.`);
                    console.error(error);
                }
            };

            // Utility: Copy Text
            const copyText = async (text) => {
                try {
                    await navigator.clipboard.writeText(text);
                    toastr.info("Copied to clipboard!", "", { timeOut: 1500, positionClass: "toast-bottom-right" });
                } catch (err) {
                    toastr.error("Failed to copy text.");
                }
            };

            // Utility: Format Date
            const formatDate = (dateString) => {
                const d = new Date(dateString);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            // Feature: Full Screen View
            const toggleFullView = () => {
                isFullView.value = !isFullView.value;
                const body = document.body;
                if (isFullView.value) {
                    body.classList.add('lead-full-view');
                } else {
                    body.classList.remove('lead-full-view');
                }
            };

            return {
                leads, loading, isSaving, form, hasMore, isFullView, tableContainer,
                sourceOptions, typeOptions, statusOptions,
                handleScroll, openAddModal, saveLead, updateLead, copyText, formatDate, toggleFullView
            };
        }
    }).mount('#lead-app');

});