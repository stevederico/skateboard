import Header from '@stevederico/skateboard-ui/Header';

/**
 * Blank view template component
 *
 * Minimal view with Header only. Use as starting point for new views.
 *
 * @component
 * @returns {JSX.Element} Blank view with header
 */
export default function BlankView() {
  return (
    <>
      <Header
        buttonClass=""
        title={"Blank"}
      />
    </>
  )
}