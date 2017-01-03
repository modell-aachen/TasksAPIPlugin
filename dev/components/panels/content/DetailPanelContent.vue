<template>
    <div v-if="task">
        <h2>{{displayValue("Title")}}</h2>
        <p>{{displayValue("Description")}}</p>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
export default {
    mixins: [TaskPanelMixin],
};
</script>

<style lang="sass">
</style>
