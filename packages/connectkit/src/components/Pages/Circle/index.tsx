import React, { useEffect, useRef } from 'react';

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

const CircleSignIn: React.FC = () => {
  const locales = useLocales({});
  const { connect } = useConnect();
  const connectors = useConnectors();

  const { status, issues, canShowDiagnostics, error, signIn, address } =
    useCircleLogin();

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

  if (status === 'unconfigured' || (status === 'error' && issues.length > 0)) {
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
        <ModalContent style={{ paddingBottom: 12 }}>
          <ModalH1 $small>{locales.circleScreen_misconfigured_heading}</ModalH1>
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
      </PageContent>
    );
  }

  if (status === 'authenticating' || status === 'checking') {
    return (
      <PageContent>
        <ModalContent style={{ gap: 16 }}>
          <Spinner />
          <ModalBody>{locales.circleScreen_redirecting}</ModalBody>
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

  return (
    <PageContent>
      <Container>
        <ModalContent style={{ padding: '0 0 8px', textAlign: 'left' }}>
          <ModalH1 $small>{locales.circleScreen_h1}</ModalH1>
          <ModalBody>{locales.circleScreen_p}</ModalBody>
        </ModalContent>

        <MethodList>
          <MethodButton type="button" onClick={() => signIn()}>
            <MethodIcon>
              <GoogleLogo />
            </MethodIcon>
            <MethodLabel>{locales.circleScreen_continueWithGoogle}</MethodLabel>
          </MethodButton>

          {/* Circle supports both, and the connector is built to accept them;
              only the client-side entry points remain. Shown rather than hidden
              so the roadmap is visible to users and developers alike. */}
          <MethodButton type="button" $disabled disabled>
            <MethodIcon>
              <MailIcon />
            </MethodIcon>
            <MethodLabel>
              {locales.circleScreen_continueWithEmail}
              <MethodHint>{locales.circleScreen_comingSoon}</MethodHint>
            </MethodLabel>
          </MethodButton>

          <MethodButton type="button" $disabled disabled>
            <MethodIcon>
              <PinIcon />
            </MethodIcon>
            <MethodLabel>
              {locales.circleScreen_continueWithPin}
              <MethodHint>{locales.circleScreen_comingSoon}</MethodHint>
            </MethodLabel>
          </MethodButton>
        </MethodList>

        {error && status === 'error' && (
          <ModalBody style={{ color: 'var(--ck-body-color-danger, #C81E1E)' }}>
            {canShowDiagnostics
              ? error.message
              : locales.circleScreen_unavailable_p}
          </ModalBody>
        )}

        <Footnote>
          <CircleLogo width={14} height={14} />
          {locales.circleScreen_securedByCircle}
        </Footnote>
      </Container>
    </PageContent>
  );
};

export default CircleSignIn;
