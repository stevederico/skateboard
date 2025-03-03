import constants from "@/constants.json"; 

export default function CheckoutView() {
  async function checkoutClicked() {
    try {
      const uri = `${constants.backendURL}/create-checkout-session`;
      const response = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookup_key: constants.stripeProducts[0].lookup_key }),
      });
      if (response.ok) {
        const data = await response.json();
        console.log("/create-checkout-session: ", data);
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error("No URL returned from server");
        }
      } else {
        console.log("Error with /create-checkout-session");
      }
    } catch (error) {
      console.error("Checkout failed:", error);
    }
  }

  return (
    <div className="bg-app text-white border border-app ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer" onClick={() => { checkoutClicked() }}>Subscribe</div>
  );
};
