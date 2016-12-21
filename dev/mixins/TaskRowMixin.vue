<script>
import ValueDataField from "../components/Standard/ValueDataField.vue";
import SignalDataField from "../components/Standard/SignalDataField.vue";
import BadgeDataField from "../components/Standard/BadgeDataField.vue";
import TypeDataField from "../components/Standard/TypeDataField.vue";
import ComposedDataField from "../components/Standard/ComposedDataField.vue";
import AttachmentsDataField from "../components/Standard/AttachmentsDataField.vue";
import LinkDataField from "../components/Standard/LinkDataField.vue";
import CheckBoxDataField from "../components/Standard/CheckBoxDataField.vue";
export default {
    props: ['task'],
    components : {
        ValueDataField,
        SignalDataField,
        BadgeDataField,
        TypeDataField,
        ComposedDataField,
        AttachmentsDataField,
        LinkDataField,
        CheckBoxDataField
    }
};
</script>

<style lang="sass">
.task-row {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    flex-grow: 0;
    width:100%;
}
</style>
