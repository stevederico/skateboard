import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';

const Sheet = forwardRef(({ showSheet, sheetClosed, children, customClassName, title, hideClose }, ref) => {
  const [isVisible, setIsVisible] = useState(showSheet);
  const [shouldRender, setShouldRender] = useState(showSheet);

  // Handle body scroll locking
  useEffect(() => {
    document.body.style.overflow = shouldRender ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [shouldRender]);

  // Expose show/hide methods to parent via ref
  useImperativeHandle(ref, () => ({
    show: () => {
      setShouldRender(true);
      setIsVisible(true);
    },
    hide: () => setIsVisible(false)
  }));

  // Sync with showSheet prop
  useEffect(() => {
    setShouldRender(showSheet);
    setIsVisible(showSheet);
  }, [showSheet]);

  const handleClose = () => {
    if (!hideClose) {
      setIsVisible(false);
      setTimeout(sheetClosed, 300);
    }
  };

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[105]">
      {/* Background overlay */}
      <div className="fixed inset-0" onClick={handleClose}></div>

      {/* Sliding sheet */}
      <div 
        className="w-full rounded-t-xl bg-light-back dark:bg-dark-back border-t"
        style={{
          transform: isVisible ? 'translateY(2%)' : 'translateY(100vh)',
          transition: 'transform 0.3s ease-out',
          height: '98vh'
        }}
      >
        {/* Title bar */}
        <div className="flex py-2 justify-center bg-light-component dark:bg-dark-back">
          <div className="font-semibold">{title}</div>
          {!hideClose && (
            <div className="w-10 cursor-pointer" onClick={handleClose}>
              <i className="bi bi-x" style={{ fontSize: '28px' }}></i>
            </div>
          )}
        </div>

        {/* Content */}
        <div className={customClassName || 'p-0 overflow-y-auto'}>
          {children}
        </div>
      </div>
    </div>
  );
});

export default Sheet;