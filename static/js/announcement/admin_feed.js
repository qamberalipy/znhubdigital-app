/* static/js/announcement/admin_feed.js */

const { createApp } = Vue;

createApp({
    delimiters: ['[[', ']]'],
    data() {
        return {
            loading: true, // Controls center spinner (Initial Load)
            isLoadingMore: false, // Controls floating pill (Pagination)
            
            isPosting: false,
            uploadProgress: 0,
            currentUserId: parseInt(document.querySelector('meta[name="user-id"]')?.content || 0),
            userRole: '{{ session_user_role }}', 
            
            posts: [],
            
            // Pagination & Scroll
            allLoaded: false,
            showScrollDown: false,
            unreadCount: 0,
            
            // Composer
            newPost: { content: '' },
            tempFiles: [], 
            linkPreview: null,
            
            showEmoji: false,
            emojis: [
                '👍','❤️','😂','😮','😢','😡','🔥','🎉','✅','🚀','👋','💯',
                '🙏','🤝','✨','💀','👀','🙌','🌟','💡','📅','📢','🔔','🎁',
                '🤔','😅','😎','🥺','🥳','🥴','👻','🤖','👽','🎃','👑','💎',
                '⚽','🏀','🎮','🎵','📸','🎥','🍔','🍕','🍺','✈️','🏠','💸'
            ],
            
            modal: { isOpen: false, type: '', url: '' },
            loadingViewers: false,
            viewersList: [],
            viewersModalInstance: null,
            
            // Realtime
            socket: null
        }
    },
    mounted() {
        this.fetchFeed(true);
        this.connectWebSocket();
        
        this.debouncedUrlCheck = _.debounce(this.fetchUrlMetadata, 800);
        
        const el = document.getElementById('viewersModal');
        if(el && typeof bootstrap !== 'undefined') {
            this.viewersModalInstance = new bootstrap.Modal(el);
        }
    },
    beforeUnmount() {
        if(this.socket) this.socket.close();
    },
    methods: {
        connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/announcement/ws`;
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => console.log("WS Connected");
            this.socket.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'new_post') {
                    if (!this.posts.find(p => p.id === msg.data.id)) {
                        this.posts.push(msg.data);
                        
                        // Check if user is near bottom to auto-scroll
                        const el = this.$refs.chatBody;
                        // 150px threshold to auto-scroll
                        if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
                            this.$nextTick(() => this.scrollToBottom());
                        } else {
                            this.unreadCount++;
                            this.showScrollDown = true;
                        }
                    }
                } else if (msg.type === 'delete_post') {
                    this.posts = this.posts.filter(p => p.id !== msg.id);
                }
            };
            this.socket.onclose = () => setTimeout(() => this.connectWebSocket(), 3000);
        },

        async fetchFeed(isInitial = false) {
            // Guard: Prevent overlap. If scrolling (isLoadingMore) or done (allLoaded), stop.
            if (!isInitial && (this.isLoadingMore || this.allLoaded)) return;
            
            // --- FIX: Strictly separate loading states ---
            if (isInitial) {
                this.loading = true;
            } else {
                this.isLoadingMore = true; // Only for pagination
            }
            
            try {
                const params = { limit: 20 };
                
                // If fetching older, use last ID and Direction=1 (Scroll Down logic in API means Older)
                if (!isInitial && this.posts.length > 0) {
                    params.last_id = this.posts[0].id;
                    params.direction = 1; 
                }

                const res = await axios.get('/api/announcement/', { params });
                
                // Reverse to show Oldest -> Newest
                const incomingPosts = res.data.reverse(); 

                if (incomingPosts.length < 20) {
                    this.allLoaded = true;
                }

                if (isInitial) {
                    this.posts = incomingPosts;
                    // Reset loading immediately so UI updates
                    this.loading = false; 
                    
                    this.$nextTick(() => {
                        this.scrollToBottom();
                        if(this.posts.length > 0) this.markViewed(this.posts[this.posts.length-1].id);
                    });
                } else {
                    const chatBody = this.$refs.chatBody;
                    const oldScrollHeight = chatBody.scrollHeight;
                    const oldScrollTop = chatBody.scrollTop;

                    // Deduplicate
                    const existingIds = new Set(this.posts.map(p => p.id));
                    const uniqueNewPosts = incomingPosts.filter(p => !existingIds.has(p.id));

                    if (uniqueNewPosts.length === 0) {
                        this.allLoaded = true;
                    } else {
                        this.posts = [...uniqueNewPosts, ...this.posts];
                        
                        // Restore scroll position
                        this.$nextTick(() => {
                            const newScrollHeight = chatBody.scrollHeight;
                            chatBody.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
                        });
                    }
                }
            } catch (e) { 
                console.error("Feed error", e); 
            } finally { 
                this.isLoadingMore = false; 
                this.loading = false;
            }
        },

        handleScroll() {
            const el = this.$refs.chatBody;
            if (!el) return;

            // 1. Pagination Trigger (Top 50px)
            if (el.scrollTop < 50 && !this.loading && !this.allLoaded) {
                this.fetchFeed(false);
            }

            // 2. Toggle "Scroll Down" Button
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            // Show button if more than 200px away from bottom
            if (distanceFromBottom > 200) {
                this.showScrollDown = true;
            } else {
                this.showScrollDown = false;
                this.unreadCount = 0;
            }
        },

        scrollToBottom() {
            const el = this.$refs.chatBody;
            if (el) {
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                this.showScrollDown = false;
                this.unreadCount = 0;
            }
        },

        // --- Helpers ---
        async deletePost(id) {
            if(!confirm("Are you sure?")) return;
            try { await axios.delete(`/api/announcement/${id}`); this.posts = this.posts.filter(p => p.id !== id); } catch(e){}
        },
        async openViewersModal(id) {
            this.viewersList = [];
            this.loadingViewers = true;
            if(this.viewersModalInstance) this.viewersModalInstance.show();
            try {
                const res = await axios.get(`/api/announcement/${id}/viewers`);
                this.viewersList = res.data;
            } catch(e) {} finally { this.loadingViewers = false; }
        },
        getGridClass(attachments) {
            const count = attachments.filter(a => ['image','video'].includes(a.file_type)).length;
            if (count >= 4) return 'grid-4';
            if (count === 3) return 'grid-3';
            if (count === 2) return 'grid-2';
            return 'grid-1';
        },
        handleFileSelect(e) {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const objectUrl = URL.createObjectURL(file);
                this.tempFiles.push({ file: file, preview: objectUrl, type: file.type });
            });
            e.target.value = '';
        },
        async uploadAsset(file) {
            if (file.type.startsWith('video') || file.size > 10 * 1024 * 1024) {
                return await this.uploadVideoOrLargeFile(file);
            } else {
                return await this.uploadImageOrDoc(file);
            }
        },
        async uploadVideoOrLargeFile(file) {
            const ticketRes = await axios.post('/api/upload/presigned-url', {
                filename: file.name, content_type: file.type, category: 'reels'
            });
            const { upload_url, public_url } = ticketRes.data.ticket;
            await axios.put(upload_url, file, {
                headers: { 'Content-Type': file.type },
                onUploadProgress: (progressEvent) => {
                    this.uploadProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                }
            });
            return public_url;
        },
        async uploadImageOrDoc(file) {
            const fd = new FormData(); fd.append('file', file);
            let typeGroup = file.type.startsWith('image') ? 'image' : 'document';
            const res = await axios.post(`/api/upload/small-file?type_group=${typeGroup}`, fd, {
                onUploadProgress: (progressEvent) => {
                    this.uploadProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                }
            });
            return res.data.url;
        },
        async publishPost() {
            if (!this.newPost.content && this.tempFiles.length === 0) return;
            this.isPosting = true;
            this.uploadProgress = 0;
            try {
                const attachments = await Promise.all(this.tempFiles.map(async (tf) => {
                    const url = await this.uploadAsset(tf.file);
                    return {
                        file_url: url,
                        file_type: tf.type.startsWith('image') ? 'image' : tf.type.startsWith('video') ? 'video' : 'document',
                        mime_type: tf.type,
                        file_size_mb: (tf.file.size / 1024 / 1024).toFixed(2)
                    };
                }));
                this.uploadProgress = 100;
                await axios.post('/api/announcement/', { content: this.newPost.content, attachments: attachments });
                this.newPost.content = '';
                this.tempFiles.forEach(f => URL.revokeObjectURL(f.preview));
                this.tempFiles = [];
                this.linkPreview = null;
                this.showEmoji = false;
                const txt = document.querySelector('.chat-input');
                if(txt) txt.style.height = 'auto';
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error("Failed to post");
            } finally {
                this.isPosting = false;
                setTimeout(() => { this.uploadProgress = 0; }, 500);
            }
        },
        handleInput(e) {
            e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
            this.debouncedUrlCheck(this.newPost.content);
        },
        async fetchUrlMetadata(text) {
            if (!text) return;
            const match = text.match(/(https?:\/\/[^\s]+)/g);
            if (match && match[0]) {
                if (this.linkPreview && this.linkPreview.link_url === match[0]) return;
                try {
                    const res = await axios.post('/api/announcement/preview-link', { url: match[0] });
                    if (res.data.link_title) this.linkPreview = res.data;
                } catch (e) { }
            } else { this.linkPreview = null; }
        },
        clearLinkPreview() { this.linkPreview = null; },
        removeFile(i) { URL.revokeObjectURL(this.tempFiles[i].preview); this.tempFiles.splice(i, 1); },
        toggleEmoji() { this.showEmoji = !this.showEmoji; },
        addEmoji(char) { this.newPost.content += char; },
        openModal(type, url) { this.modal = { isOpen: true, type, url }; },
        closeModal() { this.modal.isOpen = false; setTimeout(() => { this.modal.url = ''; }, 200); },
        async toggleReaction(post) {
            const has = this.hasLiked(post);
            if(has) post.reactions = post.reactions.filter(r => r.user_id !== this.currentUserId);
            else post.reactions.push({ user_id: this.currentUserId, emoji: '❤️' });
            try { await axios.post(`/api/announcement/${post.id}/react`, { emoji: '❤️' }); } catch(e){}
        },
        async markViewed(id) { try { await axios.post(`/api/announcement/${id}/view`); } catch(e){} },
        isMe(id) { return this.currentUserId === id; },
        hasLiked(post) { return post.reactions.some(r => r.user_id === this.currentUserId); },
        formatTime(t) { return new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }
    }
}).mount('#announcementApp');