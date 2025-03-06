import constants from "@/constants.json";

export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

export async function getCurrentUser() {
    const token = getCookie('token');
    if (!token) {
        console.error('No token found in cookie');
        return;
    }

    try {
        const response = await fetch(`${constants.backendURL}/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('getCurrentUser:', data);
        return data;
    } catch (error) {
        console.error('Error fetching user:', error);
    }
}