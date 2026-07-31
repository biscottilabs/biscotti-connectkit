import styled from './../../../styles/styled';

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 4px;
`;

export const MethodList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const MethodButton = styled.button<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--ck-primary-button-border-radius, 16px);
  background: var(--ck-secondary-button-background, var(--ck-body-background-secondary));
  color: var(--ck-body-color);
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  text-align: left;
  transition: transform 100ms ease, opacity 100ms ease;
  cursor: ${(props) => (props.$disabled ? 'default' : 'pointer')};
  opacity: ${(props) => (props.$disabled ? 0.45 : 1)};

  &:hover {
    transform: ${(props) => (props.$disabled ? 'none' : 'scale(1.01)')};
  }
  &:active {
    transform: ${(props) => (props.$disabled ? 'none' : 'scale(0.99)')};
  }
`;

export const MethodIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
`;

export const MethodLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

export const MethodHint = styled.span`
  font-size: 12px;
  font-weight: 400;
  color: var(--ck-body-color-muted);
`;

export const EmailForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const EmailLabel = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: var(--ck-body-color);
`;

export const EmailInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 13px 14px;
  border: 1px solid var(--ck-body-color-muted);
  border-radius: var(--ck-primary-button-border-radius, 14px);
  outline: none;
  background: var(--ck-body-background-secondary);
  color: var(--ck-body-color);
  font: inherit;

  &:focus {
    border-color: var(--ck-focus-color, var(--ck-body-color));
    box-shadow: 0 0 0 2px var(--ck-focus-color, rgba(31, 26, 48, 0.15));
  }
`;

export const EmailSubmit = styled.button`
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--ck-primary-button-border-radius, 16px);
  background: var(--ck-primary-button-background);
  color: var(--ck-primary-button-color);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 100ms ease, opacity 100ms ease;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
  &:not(:disabled):hover {
    transform: scale(1.01);
  }
  &:not(:disabled):active {
    transform: scale(0.99);
  }
`;

export const BackButton = styled.button`
  align-self: flex-start;
  padding: 0;
  color: var(--ck-body-color-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    color: var(--ck-body-color);
  }
`;

export const Footnote = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--ck-body-color-muted);
`;

/**
 * Developer diagnostics. Rendered only outside production (or in debugMode), so
 * it favours legibility over polish — a developer needs to see the variable
 * name and where it belongs, not a pretty error.
 */
export const IssueList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0 2px 0 0;
  max-height: min(280px, calc(100vh - 260px));
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  text-align: left;

  scrollbar-width: thin;
  scrollbar-color: var(--ck-body-color-muted) transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: var(--ck-body-color-muted);
  }
`;

export const Issue = styled.li`
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ck-body-background-secondary);
  font-size: 13px;
  line-height: 1.45;
  color: var(--ck-body-color);
`;

export const IssueHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`;

export const IssueKey = styled.code`
  font-family: var(--ck-font-family, monospace);
  font-size: 12px;
  font-weight: 600;
  word-break: break-all;
`;

export const IssueScope = styled.span<{ $severity: 'error' | 'warning' }>`
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${(props) => (props.$severity === 'error' ? '#C81E1E' : '#8A6100')};
  background: ${(props) =>
    props.$severity === 'error'
      ? 'rgba(200, 30, 30, 0.12)'
      : 'rgba(217, 155, 0, 0.15)'};
`;

export const IssueMessage = styled.div`
  color: var(--ck-body-color-muted);
`;

export const IssueLink = styled.a`
  display: inline-block;
  margin-top: 4px;
  color: var(--ck-body-color-muted);
  text-decoration: underline;
`;
