document.addEventListener('DOMContentLoaded', function() {
    // EmailJS Configuration - Replace with your actual IDs
    const EMAILJS_CONFIG = {
        publicKey: '-y7l06aJpcKYNVoUO',      // Replace with your EmailJS public key
        serviceId: 'service_5gamgdg',      // Replace with your service ID  
        templateId: 'template_3pziwdq'     // Replace with your template ID
    };

    // Initialize EmailJS
    emailjs.init(EMAILJS_CONFIG.publicKey);

    const contactForm = document.getElementById('contact-form');
    const successMessage = document.getElementById('success-message');
    const closeSuccessBtn = document.getElementById('close-success');

    // Handle form submission
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Validate form before submission
            if (!validateForm()) {
                return;
            }

            // Get form data
            const formData = new FormData(contactForm);
            const data = {};
            
            // Convert FormData to object
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }

            // Add checkbox value and format data for EmailJS
            const emailData = {
                to_email: 'tuanzispanish@163.com',
                from_name: data.name,
                from_email: data.email,
                phone: data.phone || 'Not provided',
                level: data.level || 'Not specified',
                interest: data.interest || 'Not specified',
                message: data.message,
                newsletter: document.getElementById('newsletter').checked ? 'Yes' : 'No'
            };

            // Submit form via EmailJS
            submitContactForm(emailData);
        });
    }

    // Close success message
    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', function() {
            hideSuccessMessage();
        });
    }

    // Close success message when clicking outside
    if (successMessage) {
        successMessage.addEventListener('click', function(e) {
            if (e.target === successMessage) {
                hideSuccessMessage();
            }
        });
    }

    // Handle escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && successMessage.style.display === 'flex') {
            hideSuccessMessage();
        }
    });

    function submitContactForm(data) {
        // Show loading state
        const submitBtn = contactForm.querySelector('.submit-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        // Send email via EmailJS
        emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templateId,
            data
        )
        .then(function(response) {
            console.log('Email sent successfully:', response);
            
            // Reset button state
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;

            // Show success message
            showSuccessMessage();

            // Reset form
            contactForm.reset();
        })
        .catch(function(error) {
            console.error('Email sending failed:', error);
            
            // Reset button state
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;

            // Show error message
            showErrorMessage('Failed to send message. Please try again or contact us directly.');
        });
    }

    function validateForm() {
        const requiredFields = contactForm.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;

        requiredFields.forEach(field => {
            if (!validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    function showSuccessMessage() {
        if (successMessage) {
            successMessage.style.display = 'flex';
            setTimeout(() => {
                successMessage.classList.add('show');
            }, 10);
        }
    }

    function hideSuccessMessage() {
        if (successMessage) {
            successMessage.classList.remove('show');
            setTimeout(() => {
                successMessage.style.display = 'none';
            }, 300);
        }
    }

    function showErrorMessage(message) {
        // Create or update error message display
        let errorDiv = document.querySelector('.form-error-message');
        
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'form-error-message';
            errorDiv.style.cssText = `
                background-color: #f8d7da;
                color: #721c24;
                padding: 1rem;
                border-radius: 4px;
                margin-bottom: 1rem;
                border: 1px solid #f5c6cb;
            `;
            contactForm.insertBefore(errorDiv, contactForm.firstChild);
        }
        
        errorDiv.textContent = message;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorDiv) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // Form validation enhancements
    const inputs = contactForm.querySelectorAll('input[required], select[required], textarea[required]');
    
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
        });

        input.addEventListener('input', function() {
            // Remove error styling when user starts typing
            if (this.classList.contains('error')) {
                this.classList.remove('error');
                removeErrorMessage(this);
            }
        });
    });

    function validateField(field) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Remove existing error
        field.classList.remove('error');
        removeErrorMessage(field);

        // Required field validation
        if (field.hasAttribute('required') && !value) {
            isValid = false;
            errorMessage = 'This field is required';
        }

        // Email validation
        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            }
        }

        // Phone validation (basic)
        if (field.type === 'tel' && value) {
            const phoneRegex = /^[\+]?[\s\-\(\)]*([0-9][\s\-\(\)]*){10,}$/;
            if (!phoneRegex.test(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid phone number';
            }
        }

        if (!isValid) {
            field.classList.add('error');
            showFieldErrorMessage(field, errorMessage);
        }

        return isValid;
    }

    function showFieldErrorMessage(field, message) {
        removeErrorMessage(field);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.color = '#dc3545';
        errorDiv.style.fontSize = '0.85rem';
        errorDiv.style.marginTop = '0.25rem';
        
        field.parentNode.appendChild(errorDiv);
    }

    function removeErrorMessage(field) {
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    // Add error styles to CSS if not already present
    const style = document.createElement('style');
    style.textContent = `
        .form-group input.error,
        .form-group select.error,
        .form-group textarea.error {
            border-color: #dc3545;
            box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1);
        }
    `;
    document.head.appendChild(style);
});