<template>
<div v-if="task" class="task-row">
    <div class="row-item"><value-data-field :task="task" field="Prioritize"></value-data-field></div>
    <div class="row-item">
        <composed-data-field :task="task">
            <value-data-field :task="task" field="Author"></value-data-field>
            <value-data-field :task="task" field="Created"></value-data-field>
        </composed-data-field>
    </div>
    <div class="row-item"><type-data-field :task="task"></type-data-field></div>
    <div class="row-item"><value-data-field :task="task" field="AssignedTo"></value-data-field></div>
    <div class="row-item"><value-data-field :task="task" field="Title"></value-data-field></div>
    <div class="row-item"><value-data-field :task="task" field="DueDate"></value-data-field></div>
    <div class="row-item"><value-data-field :task="task" field="Status"></value-data-field></div>
</div>
</template>


<script>
import TaskRowMixin from "../../mixins/TaskRowMixin.vue";
import ValueDataField from "./ValueDataField.vue";
import TypeDataField from "./TypeDataField.vue";
import ComposedDataField from "./ComposedDataField.vue";
export default {
    mixins: [TaskRowMixin],
    components : {
        ValueDataField,
        TypeDataField,
        ComposedDataField
    }
};
</script>

<style lang="sass">
.row-item {
    flex-grow: 1;
    flex-basis: 0;
}
</style>
