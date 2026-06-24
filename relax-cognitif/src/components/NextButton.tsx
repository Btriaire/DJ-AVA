import Icon from "./Icon";

type Props = {
  disabled: boolean;
  last: boolean;
  onClick: () => void;
};

/** Gros bouton « Suivant » avec flèche SVG, pensé pour le tactile senior. */
export default function NextButton({ disabled, last, onClick }: Props) {
  return (
    <div className="next-row">
      <button className="btn btn-next" disabled={disabled} onClick={onClick}>
        <span>{last ? "Voir le résultat" : "Suivant"}</span>
        <Icon name="arrow-next" size={26} />
      </button>
    </div>
  );
}
