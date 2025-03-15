import constants from "@/constants.json";

export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

export function getBackendURL() {
    let result = import.meta.env.DEV ? constants.devBackendURL : constants.backendURL;
    return result
}

export function isAppMode() {
    let a = !!(
        typeof window !== 'undefined' &&
        window.webkit &&
        window.webkit.messageHandlers
    );
    return a
}

export async function getCurrentUser() {
    const token = getCookie('token');
    if (!token) {
        console.error('No token found in cookie');
        return;
    }

    try {
        const response = await fetch(`${getBackendURL()}/me`, {
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
        return data;
    } catch (error) {
        console.error('Error fetching user:', error);
        return null
    }
}

export async function isSubscriber() {
    const token = getCookie('token');
    if (!token) {
        console.error('No token found in cookie');
        return false;
    }

    try {
        const response = await fetch(`${getBackendURL()}/isSubscriber`, {
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
        if (data.isSubscriber === true) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking subscription:', error);
        return false;
    }
}

export async function logEvent(event) {
    //insert analytics code here
}

export async function showManage(stripeID) {
    const token = getCookie('token');
    if (!token) {
        console.error('No token found in cookie');
        return false;
    }
    try {
        const uri = `${getBackendURL()}/create-portal-session`;
        const response = await fetch(uri, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ customerID: stripeID }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log("/create-portal-session response: ", data);
            if (data.url) {

                localStorage.setItem("beforeManageURL", window.location.href);

                window.location.href = data.url; // Redirect to Stripe billing portal
            } else {
                console.error("No URL returned from server");
            }
        } else {
            console.error("Error with /create-portal-session. Status:", response.status);
        }
    } catch (error) {
        console.error("Request failed:", error);
    }
}

export async function showCheckout(email, productIndex = 0) {
    const token = getCookie('token');
    if (!token) {
        console.error('No token found in cookie');
        return false;
    }

    try {


        const params = {
            lookup_key: constants.default.stripeProducts[productIndex].lookup_key,
            email: email
        };

        const uri = `${getBackendURL()}/create-checkout-session`;
        const response = await fetch(uri, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,

            },
            body: JSON.stringify(params),
        });

        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                // Save the current URL in localStorage before redirecting
                localStorage.setItem("beforeCheckoutURL", window.location.href);
                // Redirect to Stripe Checkout
                window.location.href = data.url;
                return true;
            } else {
                console.error("No URL returned from server");
                return false;
            }
        } else {
            console.error("Error with /create-checkout-session. Status:", response.status);
            return false;
        }
    } catch (error) {
        console.error("Checkout failed:", error);
        return false;
    }
}

export function timestampToString(input, format = "DOB") {

    let seconds = 0

    // Convert Date object to timestamp in seconds
    if (input instanceof Date) {
        seconds = input.getTime() / 1000;
    } else if (typeof input === 'number') {
        const digits = Math.abs(input).toString().length;
        if (digits > 11) {
            seconds = input / 1000
        } else {
            seconds = input
        }
    } else {
        return "BAD-INPUT";
    }

    // Ensure ts is in milliseconds
    const date = new Date(seconds * 1000);

    switch (format) {
        case "DOB":
            return date.toLocaleDateString();
        case "ISO":
            return date.toLocaleString();
        case "ago": {
            const now = new Date();
            const diffInSeconds = Math.floor((now - date) / 1000);
            const minute = 60, hour = minute * 60, day = hour * 24;
            const week = day * 7, month = day * 30, year = day * 365;

            if (diffInSeconds < minute) return 'a few seconds ago';
            if (diffInSeconds < hour) return `${Math.floor(diffInSeconds / minute)} minute${Math.floor(diffInSeconds / minute) > 1 ? 's' : ''} ago`;
            if (diffInSeconds < day) return `${Math.floor(diffInSeconds / hour)} hour${Math.floor(diffInSeconds / hour) > 1 ? 's' : ''} ago`;
            if (diffInSeconds < week) return `${Math.floor(diffInSeconds / day)} day${Math.floor(diffInSeconds / day) > 1 ? 's' : ''} ago`;
            if (diffInSeconds < month) return `${Math.floor(diffInSeconds / week)} week${Math.floor(diffInSeconds / week) > 1 ? 's' : ''} ago`;
            if (diffInSeconds < year) return `${Math.floor(diffInSeconds / month)} month${Math.floor(diffInSeconds / month) > 1 ? 's' : ''} ago`;
            return `${Math.floor(diffInSeconds / year)} year${Math.floor(diffInSeconds / year) > 1 ? 's' : ''} ago`;
        }
        case "day-month-time": {
            const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const month = ('0' + (date.getMonth() + 1)).slice(-2);
            const day = ('0' + date.getDate()).slice(-2);
            let hours = date.getHours();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const minutes = ('0' + date.getMinutes()).slice(-2);
            return `${shortDays[date.getDay()]} ${month}/${day}, ${hours}:${minutes} ${ampm}`;
        }
        case "day": {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return days[date.getDay()];
        }
        case 'time': {
            let hours = date.getHours();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const minutes = ('0' + date.getMinutes()).slice(-2);
            return `${hours}:${minutes} ${ampm}`;
        }
        case "full": {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            let hours = date.getHours();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const minutes = ('0' + date.getMinutes()).slice(-2);
            return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()} ${hours}:${minutes} ${ampm}`;
        }
        case "DOBT": {
            const today = new Date();
            const isToday = date.toDateString() === today.toDateString();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            const isYesterday = date.toDateString() === yesterday.toDateString();

            if (isToday) {
                return date.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' });
            } else if (isYesterday) {
                return `Yesterday, ${date.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' })}`;
            } else {
                const month = date.getMonth() + 1; // no leading zero
                const day = date.getDate();        // no leading zero
                let hours = date.getHours();
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                // pad minutes to always show two digits
                const minutes = ('0' + date.getMinutes()).slice(-2);
                return `${month}/${day}/${date.getFullYear()} ${hours}:${minutes} ${ampm}`;
            }
        }


        default:
            return ts;
    }
}


