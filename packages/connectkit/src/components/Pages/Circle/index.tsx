import React, { useEffect, useRef, useState } from 'react';

import useLocales from '../../../hooks/useLocales';
import { useConnect } from '../../../hooks/useConnect';
import { useConnectors } from '../../../hooks/useConnectors';

import {
  PageContent,
  ModalContent,
  ModalH1,
  ModalBody,
} from '../../Common/Modal/styles';
import { Spinner } from '../../Common/Spinner';

import {
  Container,
  BackButton,
  EmailForm,
  EmailInput,
  EmailLabel,
  EmailSubmit,
  Footnote,
  Issue,
  IssueHeader,
  IssueKey,
  IssueLink,
  IssueList,
  IssueMessage,
  IssueScope,
  MethodButton,
  MethodHint,
  MethodIcon,
  MethodLabel,
  MethodList,
} from './styles';

import { CircleLogo, GoogleLogo, MailIcon, PinIcon } from '../../../assets/circle';
import { useCircleLogin } from '../../../circle/useCircleLogin';
import { CIRCLE_CONNECTOR_ID } from '../../../circle/connector';
import type { CircleConfigScope } from '../../../circle/types';
import { useCircleOptions } from '../../../circle/useCircleOptions';
import { hasBlockingIssues } from '../../../circle/preflight';
import { useContext as useConnectKitContext } from '../../ConnectKit';

const CircleSignIn: React.FC = () => {
  const locales = useLocales({});
  const { triggerResize } = useConnectKitContext();
  const { connect } = useConnect();
  const connectors = useConnectors();
  const circle = useCircleOptions();
  const methods = circle?.methods ?? ['google', 'email'];
  const [selectedMethod, setSelectedMethod] = useState<'email' | null>(null);
  const [email, setEmail] = useState('');

  const {
    status,
    issues,
    canShowDiagnostics,
    error,
    activeMethod,
    signInWithGoogle,
    signInWithEmail,
    cancelSignIn,
    address,
  } = useCircleLogin();

  // Circle changes between several views without changing the ConnectKit route.
  // Ask the modal to remeasure after those views render so a short loading
  // panel cannot leave the diagnostics or email form clipped.
  useEffect(() => {
    const frame = window.requestAnimationFrame(triggerResize);
    return () => window.cancelAnimationFrame(frame);
  }, [status, selectedMethod, issues.length, error?.message]);

  // Once Circle has provisioned a wallet, hand it to wagmi so the rest of the
  // app sees a normal connected account. Guarded because `connect` would
  // otherwise fire on every render while the modal is still open.
  const handedOffRef = useRef(false);
  useEffect(() => {
    if (status !== 'connected' || !address || handedOffRef.current) return;

    const connector = connectors.find(
      (candidate) => candidate.id === CIRCLE_CONNECTOR_ID
    );
    if (!connector) return;

    handedOffRef.current = true;
    connect({ connector });
  }, [status, address, connectors, connect]);

  const scopeLabel = (scope: CircleConfigScope) =>
    scope === 'server'
      ? locales.circleScreen_scope_server
      : scope === 'console'
      ? locales.circleScreen_scope_console
      : locales.circleScreen_scope_client;

  if (
    status === 'unconfigured' ||
    (status === 'error' && hasBlockingIssues(issues))
  ) {
    // Production users must never see environment-variable names, so the
    // itemised list is gated on debugMode / non-production.
    if (!canShowDiagnostics) {
      return (
        <PageContent>
          <ModalContent>
            <ModalH1>{locales.circleScreen_unavailable_heading}</ModalH1>
            <ModalBody>{locales.circleScreen_unavailable_p}</ModalBody>
          </ModalContent>
        </PageContent>
      );
    }

    return (
      <PageContent>
        <Container>
          <ModalContent style={{ padding: 0 }}>
            <ModalH1 $small>
              {locales.circleScreen_misconfigured_heading}
            </ModalH1>
            <ModalBody>{locales.circleScreen_misconfigured_p}</ModalBody>
          </ModalContent>
          <IssueList>
            {issues.map((issue) => (
              <Issue key={`${issue.id}-${issue.scope}`}>
                <IssueHeader>
                  <IssueKey>{issue.envVar ?? issue.id}</IssueKey>
                  <IssueScope $severity={issue.severity}>
                    {scopeLabel(issue.scope)}
                  </IssueScope>
                </IssueHeader>
                <IssueMessage>{issue.message}</IssueMessage>
                {issue.docsUrl && (
                  <IssueLink
                    href={issue.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {locales.learnMore}
                  </IssueLink>
                )}
              </Issue>
            ))}
          </IssueList>
        </Container>
      </PageContent>
    );
  }

  if (status === 'checking') {
    return (
      <PageContent>
        <ModalContent style={{ gap: 16 }}>
          <Spinner />
          <ModalBody>{locales.circleScreen_checking}</ModalBody>
        </ModalContent>
      </PageContent>
    );
  }

  if (status === 'authenticating') {
    return (
      <PageContent>
        <ModalContent style={{ gap: 16 }}>
          <Spinner />
          <ModalBody>
            {activeMethod === 'email'
              ? locales.circleScreen_email_verifying
              : locales.circleScreen_redirecting}
          </ModalBody>
          {activeMethod === 'email' && (
            <BackButton
              type="button"
              onClick={() => {
                cancelSignIn();
                setSelectedMethod(null);
              }}
            >
              {locales.circleScreen_cancelEmail}
            </BackButton>
          )}
        </ModalContent>
      </PageContent>
    );
  }

  if (status === 'awaitingPin') {
    return (
      <PageContent>
        <ModalContent style={{ gap: 12 }}>
          <Spinner />
          <ModalH1 $small>{locales.circleScreen_awaitingPin}</ModalH1>
          <ModalBody>{locales.circleScreen_awaitingPin_p}</ModalBody>
        </ModalContent>
      </PageContent>
    );
  }

  if (status === 'connected') {
    return (
      <PageContent>
        <ModalContent style={{ gap: 8 }}>
          <ModalH1 $small>{locales.circleScreen_connected}</ModalH1>
          <ModalBody>{address}</ModalBody>
        </ModalContent>
      </PageContent>
    );
  }

  const errorMessage =
    error && status === 'error' ? (
      <ModalBody style={{ color: 'var(--ck-body-color-danger, #C81E1E)' }}>
        {canShowDiagnostics
          ? error.message
          : locales.circleScreen_unavailable_p}
      </ModalBody>
    ) : null;

  if (selectedMethod === 'email') {
    const submitEmail = (event: React.FormEvent) => {
      event.preventDefault();
      void signInWithEmail(email);
    };

    return (
      <PageContent>
        <Container>
          <BackButton type="button" onClick={() => setSelectedMethod(null)}>
            {locales.circleScreen_chooseAnotherMethod}
          </BackButton>
          <ModalContent style={{ padding: '0 0 8px', textAlign: 'left' }}>
            <ModalH1 $small>{locales.circleScreen_email_h1}</ModalH1>
            <ModalBody>{locales.circleScreen_email_p}</ModalBody>
          </ModalContent>

          <EmailForm onSubmit={submitEmail}>
            <EmailLabel htmlFor="circle-email">
              {locales.circleScreen_email_label}
            </EmailLabel>
            <EmailInput
              id="circle-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
            <EmailSubmit type="submit" disabled={!email.trim()}>
              {locales.circleScreen_email_submit}
            </EmailSubmit>
          </EmailForm>

          {errorMessage}

          <Footnote>
            <CircleLogo width={14} height={14} />
            {locales.circleScreen_securedByCircle}
          </Footnote>
        </Container>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Container>
        <ModalContent style={{ padding: '0 0 8px', textAlign: 'left' }}>
          <ModalH1 $small>{locales.circleScreen_h1}</ModalH1>
          <ModalBody>{locales.circleScreen_p}</ModalBody>
        </ModalContent>

        <MethodList>
          {methods.includes('google') && (
            <MethodButton type="button" onClick={() => signInWithGoogle()}>
              <MethodIcon>
                <GoogleLogo />
              </MethodIcon>
              <MethodLabel>
                {locales.circleScreen_continueWithGoogle}
              </MethodLabel>
            </MethodButton>
          )}

          {methods.includes('email') && (
            <MethodButton
              type="button"
              onClick={() => setSelectedMethod('email')}
            >
              <MethodIcon>
                <MailIcon />
              </MethodIcon>
              <MethodLabel>
                {locales.circleScreen_continueWithEmail}
              </MethodLabel>
            </MethodButton>
          )}

          {methods.includes('pin') && (
            <MethodButton type="button" $disabled disabled>
              <MethodIcon>
                <PinIcon />
              </MethodIcon>
              <MethodLabel>
                {locales.circleScreen_continueWithPin}
                <MethodHint>{locales.circleScreen_comingSoon}</MethodHint>
              </MethodLabel>
            </MethodButton>
          )}
        </MethodList>

        {errorMessage}

        <Footnote>
          <CircleLogo width={14} height={14} />
          {locales.circleScreen_securedByCircle}
        </Footnote>
      </Container>
    </PageContent>
  );
};

export default CircleSignIn;
