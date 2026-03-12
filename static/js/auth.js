/* static/js/auth.js */

$(document).ready(function() {

    // --- 1. Global Password Toggler ---
    $(".eye-icon").click(function() {
        const wrapper = $(this).closest('.password-wrapper');
        const input = wrapper.find('input');
        const icon = $(this).find('i');
        
        if (input.attr("type") === "password") {
            input.attr("type", "text");
            icon.removeClass("bi-eye").addClass("bi-eye-slash");
        } else {
            input.attr("type", "password");
            icon.removeClass("bi-eye-slash").addClass("bi-eye");
        }
    });

    function showLoading(title) {
        Swal.fire({
            heightAuto: false,
            title: title || 'Processing...',
            text: 'Please wait a moment',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
    }

    function showError(xhr, defaultMsg) {
        Swal.close();
        let errorMsg = defaultMsg || "An error occurred.";
        if (xhr.responseJSON && xhr.responseJSON.detail) {
            errorMsg = xhr.responseJSON.detail;
        }
        Swal.fire({
            heightAuto: false,
            icon: 'error',
            title: 'Oops...',
            text: errorMsg,
            confirmButtonColor: '#C89E47'
        });
    }

    // ==========================================
    //  LOGIN
    // ==========================================
    if ($("#loginForm").length) {
        $("#loginForm").submit(function(e) {
            e.preventDefault();
            showLoading('Signing in...');

            const formData = {
                email: $("#email").val(),
                password: $("#password").val()
            };

            $.ajax({
                type: "POST",
                url: "/api/auth/login",
                contentType: "application/json",
                data: JSON.stringify(formData),
                
                // --- SUCCESS ---
                success: function(response) {
                    Swal.close();
                    
                    // NOTE: We do NOT save tokens to localStorage anymore.
                    // The server has set an HttpOnly Cookie automatically.

                    Swal.fire({
                        heightAuto: false,
                        icon: 'success',
                        title: 'Login Successful',
                        text: `Welcome back!`,
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.href = "/dashboard"; 
                    });
                },
                error: function(xhr) { showError(xhr, "Login failed. Check your credentials."); }
            });
        });
    }

    // ==========================================
    //  FORGOT PASSWORD
    // ==========================================
    if ($("#forgotForm").length) {
        $("#forgotForm").submit(function(e) {
            e.preventDefault();
            const email = $("#email").val();
            showLoading('Sending OTP...');

            $.ajax({
                type: "POST",
                url: "/api/auth/forgot-password",
                contentType: "application/json",
                data: JSON.stringify({ email: email }),
                success: function(response) {
                    Swal.close();
                    Swal.fire({
                        heightAuto: false,
                        icon: 'success',
                        title: 'OTP Sent!',
                        text: 'Check your email for the reset code.',
                        confirmButtonColor: '#C89E47'
                    }).then(() => {
                        window.location.href = `/reset-password?email=${encodeURIComponent(email)}`;
                    });
                },
                error: function(xhr) { showError(xhr, "Could not send reset email."); }
            });
        });
    }

    // ==========================================
    //  RESET PASSWORD
    // ==========================================
    if ($("#resetForm").length) {
        const urlParams = new URLSearchParams(window.location.search);
        const emailParam = urlParams.get('email');
        if (emailParam) $("#email").val(emailParam);

        $("#resetForm").submit(function(e) {
            e.preventDefault();
            const password = $("#new_password").val();
            const confirmPassword = $("#confirm_password").val();

            if(password !== confirmPassword) {
                Swal.fire({ heightAuto: false, icon: 'warning', title: 'Mismatch', text: 'Passwords do not match!', confirmButtonColor: '#C89E47' });
                return;
            }

            showLoading('Resetting Password...');
            const formData = {
                email: $("#email").val(),
                otp: $("#otp").val(),
                new_password: password
            };

            $.ajax({
                type: "POST",
                url: "/api/auth/reset-password",
                contentType: "application/json",
                data: JSON.stringify(formData),
                success: function(response) {
                    Swal.close();
                    Swal.fire({
                        heightAuto: false,
                        icon: 'success',
                        title: 'Password Reset!',
                        text: 'You can now login.',
                        confirmButtonColor: '#C89E47'
                    }).then(() => {
                        window.location.href = "/login";
                    });
                },
                error: function(xhr) { showError(xhr, "Password reset failed."); }
            });
        });
    }
});