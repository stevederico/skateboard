import constants from "../../constants.json";
const c = { ...constants };

export default function TextView({ details }) {
  // Function to replace placeholders with actual values
  const replacePlaceholders = (text) => {
    return text
      .replace(/_COMPANY_/g, c.companyName)
      .replace(/_WEBSITE_/g, c.companyWebsite)
      .replace(/_EMAIL_/g, c.companyEmail);
  };

  // Process the details string with replacements
  const formattedText = replacePlaceholders(details);

  return (
    <>
      <div className="p-4 overflow-y-auto whitespace-pre-wrap max-h-screen">{formattedText}</div>
    </>
  );
}