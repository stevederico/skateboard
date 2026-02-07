import Header from '@stevederico/skateboard-ui/Header';

/**
 * Blank view template component
 *
 * Minimal view with Header only. Use as starting point for new views.
 *
 * @component
 * @param {Object} props
 * @param {string} props.title - Header title
 * @returns {JSX.Element} Blank view with header
 */
export default function BlankView({ title = "Blank" }) {
  return (
    <>
      <Header title={title} />
    </>
  )
}