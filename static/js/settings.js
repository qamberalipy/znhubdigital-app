/* static/js/settings.js */

$(document).ready(function() {
    
    // --- State Variables ---
    let currentUserId = null;
    let uploadedProfilePicUrl = null;
    let iti = null; // Phone input instance
    let cropper = null; // Cropper instance

    // --- 1. Initialization ---
    initSettings();

    function initSettings() {
        // Init Phone Input
        const inputPhone = document.querySelector("#inputPhone");
        if(inputPhone) {
            iti = window.intlTelInput(inputPhone, {
                utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
                separateDialCode: true,
                preferredCountries: ["pk", "us", "gb"], // Moved PK to front for ZN Hub
            });
        }

        // Get User ID from Meta Tag
        const metaId = document.querySelector('meta[name="user-id"]');
        if (metaId && metaId.content) {
            currentUserId = metaId.content;
            loadUserProfile(currentUserId);
        } else {
            console.error("User ID not found in meta tag.");
        }
    }

    // --- 2. Tab Switching Logic ---
    $('.settings-nav-item').on('click', function() {
        $('.settings-nav-item').removeClass('active');
        $(this).addClass('active');
        
        $('.settings-nav-item span').css('color', '#9ca3af'); 
        $(this).find('span').css('color', '#2563EB'); // Updated to ZN Blue

        const target = $(this).data('tab');
        $('.tab-pane').removeClass('active').hide(); 
        $('#tab-' + target).fadeIn(200).addClass('active');
    });

    // --- 3. Load User Data (GET) ---
    async function loadUserProfile(id) {
        myshowLoader(); 
        try {
            const res = await axios.get(`/api/users/${id}`);
            const data = res.data;

            $('#inputFullName').val(data.full_name);
            $('#inputEmail').val(data.email);
            $('#inputRole').val(data.role || 'developer');
            
            // Set Phone
            if (data.phone && iti) {
                iti.setNumber(data.phone);
            } else {
                $('#inputPhone').val(data.phone);
            }

            $('#inputBio').val(data.bio);
            $('#inputDob').val(data.dob);
            $('#inputGender').val(data.gender);
            $('#inputTimezone').val(data.timezone || 'UTC'); // Bind Timezone

            if (data.profile_picture_url) {
                $('#settingsAvatar').attr('src', data.profile_picture_url);
                uploadedProfilePicUrl = data.profile_picture_url;
            }

        } catch (err) {
            console.error(err);
            showToastMessage('error', 'Failed to load profile details.');
        } finally {
            myhideLoader();
        }
    }

    // --- 4. Image Cropping & Upload Logic ---
    
    $('#uploadDropZone').on('click', function() {
        $('#fileInput').val(''); 
        $('#fileInput').click();
    });

    $('#fileInput').on('change', function(e) {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            
            reader.onload = function(evt) {
                $('#imageToCrop').attr('src', evt.target.result);
                $('#cropModal').modal('show');
            };
            reader.readAsDataURL(file);
        }
    });

    $('#cropModal').on('shown.bs.modal', function () {
        const image = document.getElementById('imageToCrop');
        cropper = new Cropper(image, {
            aspectRatio: 1, 
            viewMode: 1,
            autoCropArea: 0.8,
        });
    }).on('hidden.bs.modal', function () {
        if(cropper) {
            cropper.destroy();
            cropper = null;
        }
    });

    $('#btnCropConfirm').on('click', function() {
        if (!cropper) return;

        const canvas = cropper.getCroppedCanvas({ width: 400, height: 400 });

        if (!canvas) {
            showToastMessage('error', 'Could not crop image.');
            return;
        }

        canvas.toBlob(async function(blob) {
            $('#cropModal').modal('hide');

            const formData = new FormData();
            formData.append('file', blob, 'profile-cropped.png'); 

            const $dropZone = $('#uploadDropZone');
            const originalContent = $dropZone.html();
            $dropZone.html('<div class="spinner-border text-primary spinner-border-sm"></div> Uploading...');

            try {
                const res = await axios.post('/api/upload/general-upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (res.data.status === 'success') {
                    uploadedProfilePicUrl = res.data.url;
                    $('#settingsAvatar').attr('src', uploadedProfilePicUrl);
                    $('#user-avatar-display').attr('src', uploadedProfilePicUrl); 
                    showToastMessage('success', 'Photo uploaded! Click Save to confirm.');
                }
            } catch (err) {
                let msg = err.response?.data?.detail || "Upload failed.";
                if(err.response?.status === 413) msg = "File too large.";
                showToastMessage('error', msg);
            } finally {
                $dropZone.html(originalContent);
            }
        }, 'image/png');
    });

    // --- 5. Save Profile (PUT) ---
    $('#btnSaveProfile').on('click', async function() {
        if (!currentUserId) return;

        const fullPhoneNumber = iti ? iti.getNumber() : $('#inputPhone').val();

        const payload = {
            full_name: $('#inputFullName').val(),
            bio: $('#inputBio').val(),
            phone: fullPhoneNumber,
            dob: $('#inputDob').val() || null,
            gender: $('#inputGender').val() || null,
            timezone: $('#inputTimezone').val() || 'UTC', // Include Timezone in Payload
            profile_picture_url: uploadedProfilePicUrl
        };

        myshowLoader();
        try {
            await axios.put(`/api/users/${currentUserId}`, payload);
            showToastMessage('success', 'Profile updated successfully!');
        } catch (err) {
            showToastMessage('error', 'Failed to save changes.');
        } finally {
            myhideLoader();
        }
    });

    // --- 6. Save Password (POST) ---
    $('#btnSavePassword').on('click', async function() {
        const oldPass = $('#oldPassword').val();
        const newPass = $('#newPassword').val();
        const confirmPass = $('#confirmPassword').val();

        if (!oldPass || !newPass || !confirmPass) {
            showToastMessage('warning', 'Please fill in all password fields.');
            return;
        }
        if (newPass !== confirmPass) {
            showToastMessage('error', 'New passwords do not match.');
            return;
        }

        const payload = {
            old_password: oldPass,
            new_password: newPass,
            confirm_password: confirmPass
        };

        myshowLoader();
        try {
            await axios.post('/api/users/change-password', payload);
            $('#oldPassword').val('');
            $('#newPassword').val('');
            $('#confirmPassword').val('');
            
            Swal.fire({
                icon: 'success',
                title: 'Password Changed',
                text: 'Please log in again.',
                confirmButtonColor: '#2563EB' // Updated to ZN Blue
            }).then(() => { handleLogout(); });

        } catch (err) {
            const msg = err.response?.data?.detail || "Password change failed.";
            showToastMessage('error', msg);
        } finally {
            myhideLoader();
        }
    });
});